import { LIMITS } from '../../shared/constants'
import type { BotAccessRole, BotPlatform } from '../../shared/types'
import type { Db } from '../db/database'
import type { BotAppRow, UserRow } from '../db/rows'
import { findAllowlistEntry } from '../db/repo/bots'
import { findBotByIdInternal, touchBotChat } from '../db/repo/bots'
import { findUserById } from '../db/repo/users'
import {
  finishInboundMessage,
  insertInboundMessage,
  markInboundProcessing,
  writeCommandLog,
} from '../db/repo/inbound'
import { createDelivery } from '../db/repo/deliveries'
import { decryptConfig, botAad, SecretDecryptError } from '../notify/secrets'
import { createBotAuthorizationRequest } from '../bots/authorization'
import { logger } from '../lib/logger'
import { normalizeCommandText } from './commands/parser'
import { executeCommand, type CommandActor, type CommandServices } from './commands/executor'
import type { InboundEvent } from './types'

const log = logger.child('inbound')

function notificationTarget(
  event: InboundEvent,
): { channel: string; chatId: string } | null {
  if (!event.chatId) return null
  if (event.platform === 'dingtalk') {
    if (event.chatType === 'single') {
      return { channel: 'single', chatId: event.platformUserId }
    }
    if (event.chatType === 'group') {
      return { channel: 'group', chatId: event.chatId }
    }
    return null
  }
  if (event.platform === 'wecom') {
    return {
      channel: event.chatType ?? 'single',
      chatId: event.chatId,
    }
  }
  return { channel: 'chat', chatId: event.chatId }
}

export interface InboundDispatcherOptions {
  db: Db
  services: CommandServices
  concurrency?: number
  now?: () => number
  maxPerMinute?: { user: number; chat: number; bot: number }
}

class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  take(key: string, limit: number, windowMs: number, now: number): boolean {
    const windowStart = now - windowMs
    const list = (this.hits.get(key) ?? []).filter((time) => time > windowStart)
    if (list.length >= limit) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    if (this.hits.size > 5000) {
      for (const [entry, times] of this.hits) {
        if (times.every((time) => time <= windowStart)) this.hits.delete(entry)
      }
    }
    return true
  }
}

interface QueuedInbound {
  event: InboundEvent
  inboundId: number
}

export class InboundDispatcher {
  private readonly queue: QueuedInbound[] = []
  private active = 0
  private readonly limiter = new SlidingWindowLimiter()
  private readonly throttleNotified = new Map<string, number>()

  constructor(private readonly options: InboundDispatcherOptions) {}

  async accept(event: InboundEvent): Promise<{ inboundId: number; duplicate: boolean }> {
    const inserted = insertInboundMessage(this.options.db, {
      platform: event.platform,
      platformMessageId: event.platformMessageId,
      botAppId: event.botApp.id,
      ownerUserId: event.ownerUserId,
      chatId: event.chatId,
      userId: event.platformUserId,
      text: event.text,
      receivedAt: event.receivedAt,
    })
    if (!inserted.inserted) return { inboundId: inserted.id, duplicate: true }
    markInboundProcessing(this.options.db, inserted.id)
    this.queue.push({ event, inboundId: inserted.id })
    this.drain()
    return { inboundId: inserted.id, duplicate: false }
  }

  async handleInline(event: InboundEvent): Promise<string[]> {
    const result = await this.run(event)
    return result.lines
  }

  async runAsOwner(bot: BotAppRow, text: string): Promise<{ lines: string[]; result: string }> {
    const owner = findUserById(this.options.db, bot.user_id)
    if (!owner) return { lines: ['机器人所属账号不存在。'], result: 'error' }
    const actor: CommandActor = {
      botAppId: bot.id,
      platform: bot.platform as BotPlatform,
      chatId: 'console',
      platformUserId: 'console',
      role: 'admin',
    }
    const started = Date.now()
    const result = await executeCommand(this.options.services, actor, owner, normalizeCommandText(text))
    this.record(bot, {
      platform: bot.platform as BotPlatform,
      botApp: bot,
      ownerUserId: bot.user_id,
      platformMessageId: `dev-${started}`,
      chatId: 'console',
      platformUserId: 'console',
      userName: null,
      text,
      reply: { type: 'wecom', reqId: 'console', chatId: 'console', chatType: 'single' },
      receivedAt: started,
    }, text.split(/\s+/)[0] ?? '', {}, result.result, result.lines.join(' '), started)
    return { lines: result.lines, result: result.result }
  }

  private drain(): void {
    const concurrency = this.options.concurrency ?? 4
    while (this.active < concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!
      this.active += 1
      void this.process(item)
        .catch((error) => {
          log.error('指令处理异常', { inboundId: item.inboundId, error })
        })
        .finally(() => {
          this.active -= 1
          this.drain()
        })
    }
  }

  private async process(item: QueuedInbound): Promise<void> {
    const { event, inboundId } = item
    const result = await this.run(event)
    let deliveryId: number | null = null
    if (result.lines.length > 0 && result.deliver) {
      const delivery = createDelivery(this.options.db, {
        userId: event.ownerUserId,
        kind: 'command',
        botAppId: event.botApp.id,
        target: { reply: event.reply },
        payload: { platform: event.platform, text: result.lines.join('\n\n') },
      })
      deliveryId = delivery.id
    }
    finishInboundMessage(
      this.options.db,
      inboundId,
      result.status === 'failed' || result.status === 'error'
        ? 'failed'
        : result.status === 'ignored'
          ? 'ignored'
          : 'processed',
      result.error ?? null,
      deliveryId,
    )
  }

  private async run(event: InboundEvent): Promise<{
    lines: string[]
    status: 'ok' | 'error' | 'denied' | 'throttled' | 'parse_error' | 'failed' | 'ignored'
    error?: string
    deliver: boolean
  }> {
    const db = this.options.db
    const now = (this.options.now ?? Date.now)()
    const started = Date.now()

    const bot = findBotByIdInternal(db, event.botApp.id)
    if (!bot || bot.enabled !== 1 || bot.user_id !== event.ownerUserId) {
      return { lines: [], status: 'ignored', deliver: false }
    }
    const owner = findUserById(db, bot.user_id)
    if (!owner || owner.status !== 'active') {
      return { lines: [], status: 'ignored', deliver: false }
    }

    const normalized = normalizeCommandText(event.text)
    const isCommand = normalized.startsWith('/')
    const isSelection = /^\d{1,2}$/.test(normalized)
    if (!isCommand && !isSelection) {
      return { lines: [], status: 'ignored', deliver: false }
    }

    try {
      decryptConfig(bot.config_enc, botAad(bot.user_id, bot.platform))
    } catch (error) {
      if (error instanceof SecretDecryptError) {
        this.record(bot, event, 'help', {}, 'failed', error.message, started)
        return {
          lines: ['机器人凭据无法解密，请管理员在后台重新填写配置。'],
          status: 'failed',
          error: error.message,
          deliver: true,
        }
      }
      throw error
    }

    const limits = this.options.maxPerMinute ?? {
      user: LIMITS.commandRatePerMinute,
      chat: LIMITS.chatRatePerMinute,
      bot: LIMITS.botRatePerMinute,
    }
    const windowMs = 60_000
    const userOk = this.limiter.take(
      `u:${bot.id}:${event.platformUserId}`,
      limits.user,
      windowMs,
      now,
    )
    const chatOk = this.limiter.take(`c:${bot.id}:${event.chatId}`, limits.chat, windowMs, now)
    const botOk = this.limiter.take(`b:${bot.id}`, limits.bot, windowMs, now)
    if (!userOk || !chatOk || !botOk) {
      this.record(bot, event, 'throttled', {}, 'throttled', 'rate limited', started)
      const key = `${bot.id}:${event.platformUserId}`
      const notifiedAt = this.throttleNotified.get(key) ?? 0
      const notify = now - notifiedAt > windowMs
      if (notify) this.throttleNotified.set(key, now)
      return {
        lines: notify ? ['操作过于频繁，请稍后再试（每分钟最多 10 条指令）。'] : [],
        status: 'throttled',
        deliver: notify,
      }
    }

    const role = this.resolveRole(bot, event.platformUserId)
    if (!role) {
      this.record(bot, event, 'denied', {}, 'denied', 'not in allowlist', started)
      let lines = ['未授权，请联系机器人所有者将你的平台 ID 加入允许名单。']
      try {
        const link = createBotAuthorizationRequest(this.options.db, {
          bot,
          platformUserId: event.platformUserId,
          userName: event.userName,
          chatId: event.chatId,
        })
        lines = [
          `你还没有使用「${bot.name}」的权限。请将以下链接发送给机器人所有者；如果你是所有者，可直接在浏览器登录并批准（30 分钟内有效）：`,
          link.url,
        ]
      } catch (error) {
        log.warn('创建机器人授权链接失败', { botId: bot.id, error })
      }
      return {
        lines,
        status: 'denied',
        deliver: true,
      }
    }

    const notifyTarget = notificationTarget(event)
    if (notifyTarget) {
      touchBotChat(this.options.db, bot.id, notifyTarget.channel, notifyTarget.chatId, now)
    }

    const actor: CommandActor = {
      botAppId: bot.id,
      platform: bot.platform as BotPlatform,
      chatId: event.chatId,
      platformUserId: event.platformUserId,
      role,
    }
    const result = await executeCommand(this.options.services, actor, owner, normalized)
    this.record(bot, event, normalized.replace(/^\//, '').split(/\s+/)[0] ?? '', {}, result.result, result.lines.join('\n'), started)
    return {
      lines: result.lines,
      status: result.result,
      deliver: true,
      error: result.ok ? undefined : result.lines.join(' '),
    }
  }

  private resolveRole(
    bot: BotAppRow,
    platformUserId: string,
  ): BotAccessRole | null {
    const entry = findAllowlistEntry(this.options.db, bot.id, platformUserId)
    return entry ? (entry.role as BotAccessRole) : null
  }

  private record(
    bot: BotAppRow,
    event: InboundEvent,
    command: string,
    args: Record<string, unknown>,
    result: 'ok' | 'error' | 'denied' | 'throttled' | 'parse_error' | 'failed' | 'ignored',
    error: string | undefined,
    started: number,
  ): void {
    if (result === 'ignored') return
    writeCommandLog(this.options.db, {
      ownerUserId: bot.user_id,
      platform: bot.platform as BotPlatform,
      platformUserId: event.platformUserId,
      chatId: event.chatId,
      command: command || 'unknown',
      args,
      result: result === 'failed' ? 'error' : result,
      error: error ?? null,
      durationMs: Date.now() - started,
    })
  }
}

export function botOwnerUser(db: Db, bot: BotAppRow): UserRow | undefined {
  return findUserById(db, bot.user_id)
}
