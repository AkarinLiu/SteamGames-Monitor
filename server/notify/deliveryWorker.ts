import type { ChannelType, MonitorEvent } from '../../shared/types'
import type { Db } from '../db/database'
import type { DeliveryRow } from '../db/rows'
import { toEvent } from '../db/rows'
import {
  cancelDelivery,
  claimDueDeliveries,
  markDeliveryFailed,
  markDeliverySent,
} from '../db/repo/deliveries'
import { findChannelById } from '../db/repo/channels'
import { findMonitorByIdInternal } from '../db/repo/monitors'
import { findUserById } from '../db/repo/users'
import { decryptConfig, SecretDecryptError, channelAad } from './secrets'
import { renderEventMessage, renderTestMessage } from './render'
import { sendWecom } from './transports/wecomBot'
import { sendFeishu } from './transports/feishuBot'
import { sendDingtalk } from './transports/dingtalkBot'
import { sendSmtp } from './transports/smtp'
import type {
  ChannelConfig,
  DingtalkChannelConfig,
  FeishuChannelConfig,
  RenderedMessage,
  SendResult,
  SmtpChannelConfig,
  WecomChannelConfig,
} from './types'
import { logger } from '../lib/logger'

const log = logger.child('delivery')
const RETRY_DELAYS = [30_000, 2 * 60_000, 10 * 60_000, 3_600_000, 6 * 3_600_000, 24 * 3_600_000]

export type CommandDeliverySender = (delivery: DeliveryRow) => Promise<SendResult>

export interface DeliveryWorkerOptions {
  intervalMs?: number
  concurrency?: number
  now?: () => number
  sendCommand?: CommandDeliverySender
}

export class DeliveryWorker {
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private active = 0

  constructor(
    private readonly db: Db,
    private readonly options: DeliveryWorkerOptions = {},
  ) {}

  get isRunning(): boolean {
    return this.timer !== null && !this.stopped
  }

  setCommandSender(sender: CommandDeliverySender): void {
    this.options.sendCommand = sender
  }

  start(): void {
    if (this.timer || this.stopped) return
    this.timer = setInterval(() => {
      void this.tick()
    }, this.options.intervalMs ?? 2000)
    this.timer.unref?.()
    void this.tick()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000))
    while (this.active > 0) {
      await Promise.race([timeout, new Promise((resolve) => setTimeout(resolve, 100))])
    }
  }

  async tick(): Promise<number> {
    if (this.stopped) return 0
    const concurrency = this.options.concurrency ?? 3
    if (this.active >= concurrency) return 0
    const now = (this.options.now ?? Date.now)()
    const claimed = claimDueDeliveries(this.db, now, concurrency - this.active)
    if (claimed.length === 0) return 0
    this.active += claimed.length
    try {
      await Promise.allSettled(
        claimed.map(async (row) => {
          try {
            await this.process(row)
          } finally {
            this.active -= 1
          }
        }),
      )
    } finally {
      this.active = Math.max(0, this.active)
    }
    return claimed.length
  }

  async process(row: DeliveryRow): Promise<void> {
    try {
      const result = await this.send(row)
      if (result.canceled) return
      if (result.ok) {
        markDeliverySent(this.db, row.id, result.httpStatus)
        return
      }
      const retryAfterMs = result.retryAfterMs
      if (result.permanent) {
        markDeliveryFailed(this.db, row.id, {
          error: result.error ?? '永久失败',
          httpStatus: result.httpStatus,
          permanent: true,
        })
        return
      }
      const attempts = Number(row.attempts)
      const delay = retryAfterMs ?? RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)]!
      markDeliveryFailed(this.db, row.id, {
        error: result.error ?? '发送失败',
        httpStatus: result.httpStatus,
        retryAt: Date.now() + delay,
      })
    } catch (error) {
      log.error('投递处理异常', { deliveryId: row.id, error })
      markDeliveryFailed(this.db, row.id, {
        error: (error as Error)?.message ?? '未知错误',
        retryAt: Date.now() + 30_000,
      })
    }
  }

  private async send(row: DeliveryRow): Promise<SendResult> {
    if (row.kind === 'command') {
      if (!this.options.sendCommand) {
        return { ok: false, httpStatus: null, error: '指令回复投递器未配置', permanent: true }
      }
      return this.options.sendCommand(row)
    }

    if (!row.channel_id) {
      return { ok: false, httpStatus: null, error: '投递缺少通知渠道', permanent: true }
    }
    const channel = findChannelById(this.db, row.channel_id)
    if (!channel) {
      cancelDelivery(this.db, row.id, '通知渠道已删除')
      return { ok: false, httpStatus: null, canceled: true }
    }
    if (channel.enabled !== 1) {
      cancelDelivery(this.db, row.id, '通知渠道已停用')
      return { ok: false, httpStatus: null, canceled: true }
    }

    let message: RenderedMessage
    if (row.kind === 'test') {
      const user = findUserById(this.db, row.user_id)
      message = renderTestMessage(channel.name, user?.timezone ?? null)
    } else {
      const event = this.loadEvent(row.event_id)
      if (!event) {
        return { ok: false, httpStatus: null, error: '事件不存在', permanent: true }
      }
      const monitor = findMonitorByIdInternal(this.db, event.monitorId)
      if (!monitor) {
        return { ok: false, httpStatus: null, error: '监控项不存在', permanent: true }
      }
      const user = findUserById(this.db, row.user_id)
      message = renderEventMessage(event, monitor, user?.timezone ?? null)
    }

    let config: ChannelConfig
    try {
      config = decryptConfig<ChannelConfig>(
        channel.config_enc,
        channelAad(channel.user_id, channel.type),
      )
    } catch (error) {
      if (error instanceof SecretDecryptError) {
        return { ok: false, httpStatus: null, error: error.message, permanent: true }
      }
      throw error
    }

    return sendByChannel(channel.type as ChannelType, config, message)
  }

  private loadEvent(eventId: number | null): MonitorEvent | null {
    if (eventId === null) return null
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as
      | Parameters<typeof toEvent>[0]
      | undefined
    return row ? toEvent(row) : null
  }
}

export function sendByChannel(
  type: ChannelType,
  config: ChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  switch (type) {
    case 'wecom_bot':
      return sendWecom(config as WecomChannelConfig, message)
    case 'feishu_bot':
      return sendFeishu(config as FeishuChannelConfig, message)
    case 'dingtalk_bot':
      return sendDingtalk(config as DingtalkChannelConfig, message)
    case 'smtp':
      return sendSmtp(config as SmtpChannelConfig, message)
    default:
      return Promise.resolve({
        ok: false,
        httpStatus: null,
        error: `不支持的通知渠道类型：${type}`,
        permanent: true,
      })
  }
}
