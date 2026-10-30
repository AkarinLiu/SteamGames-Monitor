import { DWClient, TOPIC_ROBOT, type DWClientDownStream } from 'dingtalk-stream'
import type { BotConnectionStatus } from '../../../shared/types'
import type { Db } from '../../db/database'
import type { BotAppRow } from '../../db/rows'
import { listEnabledBotsByPlatform } from '../../db/repo/bots'
import { logger } from '../../lib/logger'
import { botAad, decryptConfig } from '../../notify/secrets'
import type { DingtalkBotConfig, InboundEvent } from '../types'
import { handleDingtalkStreamEvent } from '../platforms/dingtalk'
import { resolveDingtalkConnectionMode } from './connection'

const log = logger.child('dingtalk')

export interface DingtalkStreamHandlers {
  onConnected: () => void
  onError: (error: Error) => void
  onMessage: (message: { messageId: string; data: string }) => void
}

export interface DingtalkStreamSocket {
  connect: () => void
  disconnect: () => void
  isConnected: () => boolean
  ack: (messageId: string) => void
}

export type DingtalkStreamSocketFactory = (input: {
  clientId: string
  clientSecret: string
  handlers: DingtalkStreamHandlers
}) => DingtalkStreamSocket

export interface DingtalkEventSink {
  accept: (event: InboundEvent) => Promise<unknown>
}

export interface DingtalkStreamManagerOptions {
  db: Db
  dispatcher: DingtalkEventSink
  createSocket?: DingtalkStreamSocketFactory
}

interface ConnectionEntry {
  bot: BotAppRow
  configEnc: string
  config: DingtalkBotConfig
  socket: DingtalkStreamSocket | null
  status: BotConnectionStatus
}

function createOfficialSocket(input: {
  clientId: string
  clientSecret: string
  handlers: DingtalkStreamHandlers
}): DingtalkStreamSocket {
  const client = new DWClient({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    debug: false,
  })
  client.registerCallbackListener(TOPIC_ROBOT, (message: DWClientDownStream) => {
    input.handlers.onMessage({
      messageId: message.headers?.messageId ?? '',
      data: message.data,
    })
  })

  return {
    connect: () => {
      void client
        .connect()
        .then(() => {
          if (client.connected) input.handlers.onConnected()
          else input.handlers.onError(new Error('钉钉 Stream 连接失败'))
        })
        .catch((error: Error) => input.handlers.onError(error))
    },
    disconnect: () => client.disconnect(),
    isConnected: () => client.connected,
    ack: (messageId) => {
      if (messageId) client.socketCallBackResponse(messageId, { success: true })
    },
  }
}

export class DingtalkStreamManager {
  private readonly entries = new Map<number, ConnectionEntry>()
  private readonly createSocket: DingtalkStreamSocketFactory
  private stopping = false

  constructor(private readonly options: DingtalkStreamManagerOptions) {
    this.createSocket = options.createSocket ?? createOfficialSocket
  }

  start(): void {
    this.stopping = false
    this.sync()
  }

  stop(): void {
    this.stopping = true
    for (const entry of this.entries.values()) this.closeSocket(entry)
    this.entries.clear()
  }

  statusFor(botId: number): BotConnectionStatus {
    const entry = this.entries.get(botId)
    if (!entry) return { state: 'disconnected', since: 0 }
    if (entry.socket?.isConnected()) {
      return { state: 'connected', since: entry.status.since }
    }
    if (entry.status.state === 'connected') {
      return { state: 'connecting', message: '正在重连', since: Date.now() }
    }
    return entry.status
  }

  sync(): void {
    if (this.stopping) return
    const rows = listEnabledBotsByPlatform(this.options.db, 'dingtalk')
    const active = new Set<number>()

    for (const bot of rows) {
      let config: DingtalkBotConfig
      try {
        config = decryptConfig<DingtalkBotConfig>(
          bot.config_enc,
          botAad(bot.user_id, bot.platform),
        )
      } catch (error) {
        active.add(bot.id)
        const existing = this.entries.get(bot.id)
        if (existing) this.closeSocket(existing)
        this.entries.set(bot.id, {
          bot,
          configEnc: bot.config_enc,
          config: {},
          socket: null,
          status: {
            state: 'error',
            message: `凭据无法解密：${(error as Error).message}`,
            since: Date.now(),
          },
        })
        continue
      }

      if (resolveDingtalkConnectionMode(config) !== 'stream') {
        const existing = this.entries.get(bot.id)
        if (existing) {
          this.closeSocket(existing)
          this.entries.delete(bot.id)
        }
        continue
      }

      active.add(bot.id)
      const existing = this.entries.get(bot.id)
      if (existing && existing.configEnc === bot.config_enc) {
        existing.bot = bot
        existing.config = config
        continue
      }
      if (existing) {
        this.closeSocket(existing)
        this.entries.delete(bot.id)
      }

      if (!config.appKey || !config.appSecret) {
        this.entries.set(bot.id, {
          bot,
          configEnc: bot.config_enc,
          config,
          socket: null,
          status: {
            state: 'error',
            message: '请填写 App Key 和 App Secret 后再使用 Stream 模式',
            since: Date.now(),
          },
        })
        continue
      }

      const entry: ConnectionEntry = {
        bot,
        configEnc: bot.config_enc,
        config,
        socket: null,
        status: { state: 'connecting', since: Date.now() },
      }
      try {
        const socket = this.createSocket({
          clientId: config.appKey,
          clientSecret: config.appSecret,
          handlers: this.handlersFor(entry),
        })
        entry.socket = socket
        this.entries.set(bot.id, entry)
        socket.connect()
      } catch (error) {
        entry.status = {
          state: 'error',
          message: (error as Error).message,
          since: Date.now(),
        }
        this.entries.set(bot.id, entry)
      }
    }

    for (const [botId, entry] of this.entries) {
      if (active.has(botId)) continue
      this.closeSocket(entry)
      this.entries.delete(botId)
    }
  }

  private handlersFor(entry: ConnectionEntry): DingtalkStreamHandlers {
    const isCurrent = () => this.entries.get(entry.bot.id) === entry
    return {
      onConnected: () => {
        if (!isCurrent()) return
        entry.status = { state: 'connected', since: Date.now() }
        log.info('钉钉 Stream 长连接已建立', { botId: entry.bot.id })
      },
      onError: (error) => {
        if (!isCurrent()) return
        entry.status = { state: 'error', message: error.message, since: Date.now() }
        log.warn('钉钉 Stream 长连接异常', {
          botId: entry.bot.id,
          error: error.message,
        })
      },
      onMessage: ({ messageId, data }) => {
        if (!isCurrent()) return
        entry.socket?.ack(messageId)
        const result = handleDingtalkStreamEvent({
          bot: entry.bot,
          config: entry.config,
          payload: data,
        })
        if (result.kind !== 'event') {
          log.debug('忽略钉钉 Stream 事件', { botId: entry.bot.id, kind: result.kind })
          return
        }
        log.debug('收到钉钉消息', {
          botId: entry.bot.id,
          chatId: result.event.chatId,
          chatType: result.event.chatType,
          textLength: result.event.text.length,
        })
        void this.options.dispatcher.accept(result.event).catch((error) => {
          log.error('处理钉钉消息失败', { botId: entry.bot.id, error })
        })
      },
    }
  }

  private closeSocket(entry: ConnectionEntry): void {
    if (!entry.socket) return
    try {
      entry.socket.disconnect()
    } catch (error) {
      log.warn('关闭钉钉 Stream 长连接失败', { botId: entry.bot.id, error })
    }
    entry.socket = null
  }
}
