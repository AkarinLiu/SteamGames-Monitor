import {
  Domain,
  EventDispatcher,
  LoggerLevel,
  WSClient,
} from '@larksuiteoapi/node-sdk'
import type { BotConnectionStatus } from '../../../shared/types'
import type { Db } from '../../db/database'
import type { BotAppRow } from '../../db/rows'
import { listEnabledBotsByPlatform } from '../../db/repo/bots'
import { logger } from '../../lib/logger'
import { botAad, decryptConfig } from '../../notify/secrets'
import type { FeishuBotConfig, InboundEvent } from '../types'
import { handleFeishuWsEvent } from '../platforms/feishu'
import { resolveFeishuBrand, resolveFeishuConnectionMode } from './domains'

const log = logger.child('feishu')

export interface FeishuSocketHandlers {
  onReady: () => void
  onReconnecting: () => void
  onReconnected: () => void
  onError: (error: Error) => void
  onMessage: (payload: unknown) => void
}

export interface FeishuSocket {
  start: () => void
  close: () => void
}

export type FeishuSocketFactory = (input: {
  appId: string
  appSecret: string
  brand: 'feishu' | 'lark'
  handlers: FeishuSocketHandlers
}) => FeishuSocket

export interface FeishuEventSink {
  accept: (event: InboundEvent) => Promise<unknown>
}

export interface FeishuLongConnectionManagerOptions {
  db: Db
  dispatcher: FeishuEventSink
  createSocket?: FeishuSocketFactory
}

interface ConnectionEntry {
  bot: BotAppRow
  configEnc: string
  config: FeishuBotConfig
  socket: FeishuSocket | null
  status: BotConnectionStatus
  fatal: boolean
}

function createOfficialSocket(input: {
  appId: string
  appSecret: string
  brand: 'feishu' | 'lark'
  handlers: FeishuSocketHandlers
}): FeishuSocket {
  const sdkLogger = {
    error: (message: unknown) =>
      log.warn('飞书 SDK 错误', { message: String(message).slice(0, 300) }),
    warn: (message: unknown) =>
      log.debug('飞书 SDK 警告', { message: String(message).slice(0, 300) }),
    info: () => {},
    debug: () => {},
    trace: () => {},
  }

  const dispatcher = new EventDispatcher({
    loggerLevel: LoggerLevel.error,
    logger: sdkLogger,
  })
  dispatcher.register({
    'im.message.receive_v1': (payload: unknown) => {
      input.handlers.onMessage(payload)
    },
  })

  const client = new WSClient({
    appId: input.appId,
    appSecret: input.appSecret,
    domain: input.brand === 'lark' ? Domain.Lark : Domain.Feishu,
    loggerLevel: LoggerLevel.warn,
    logger: sdkLogger,
    onReady: input.handlers.onReady,
    onReconnecting: input.handlers.onReconnecting,
    onReconnected: input.handlers.onReconnected,
    onError: input.handlers.onError,
  })

  return {
    start: () => {
      void client.start({ eventDispatcher: dispatcher }).catch((error: Error) => {
        input.handlers.onError(error)
      })
    },
    close: () => client.close({ force: true }),
  }
}

export class FeishuLongConnectionManager {
  private readonly entries = new Map<number, ConnectionEntry>()
  private readonly createSocket: FeishuSocketFactory
  private stopping = false

  constructor(private readonly options: FeishuLongConnectionManagerOptions) {
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
    return this.entries.get(botId)?.status ?? { state: 'disconnected', since: 0 }
  }

  sync(): void {
    if (this.stopping) return
    const rows = listEnabledBotsByPlatform(this.options.db, 'feishu')
    const active = new Set<number>()

    for (const bot of rows) {
      const existing = this.entries.get(bot.id)
      let config: FeishuBotConfig
      try {
        config = decryptConfig<FeishuBotConfig>(
          bot.config_enc,
          botAad(bot.user_id, bot.platform),
        )
      } catch (error) {
        active.add(bot.id)
        if (existing) {
          this.closeSocket(existing)
          this.entries.delete(bot.id)
        }
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
          fatal: false,
        })
        continue
      }

      if (resolveFeishuConnectionMode(config) !== 'websocket') {
        if (existing) {
          this.closeSocket(existing)
          this.entries.delete(bot.id)
        }
        continue
      }

      active.add(bot.id)
      if (existing && existing.configEnc === bot.config_enc) {
        existing.bot = bot
        existing.config = config
        continue
      }

      if (existing) {
        this.closeSocket(existing)
        this.entries.delete(bot.id)
      }

      if (!config.appId || !config.appSecret) {
        this.entries.set(bot.id, {
          bot,
          configEnc: bot.config_enc,
          config,
          socket: null,
          status: {
            state: 'error',
            message: '请填写 App ID 和 App Secret 后再使用长连接',
            since: Date.now(),
          },
          fatal: false,
        })
        continue
      }

      const brand = resolveFeishuBrand(config)
      const entry: ConnectionEntry = {
        bot,
        configEnc: bot.config_enc,
        config,
        socket: null,
        status: { state: 'connecting', since: Date.now() },
        fatal: false,
      }
      try {
        const socket = this.createSocket({
          appId: config.appId,
          appSecret: config.appSecret,
          brand,
          handlers: this.handlersFor(entry),
        })
        entry.socket = socket
        this.entries.set(bot.id, entry)
        socket.start()
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

  private handlersFor(entry: ConnectionEntry): FeishuSocketHandlers {
    const isCurrent = () => this.entries.get(entry.bot.id) === entry
    return {
      onReady: () => {
        if (!isCurrent()) return
        entry.fatal = false
        entry.status = { state: 'connected', since: Date.now() }
        log.info('飞书长连接已建立', { botId: entry.bot.id })
      },
      onReconnecting: () => {
        if (!isCurrent() || entry.fatal) return
        entry.status = { state: 'connecting', message: '正在重连', since: Date.now() }
      },
      onReconnected: () => {
        if (!isCurrent()) return
        entry.fatal = false
        entry.status = { state: 'connected', since: Date.now() }
        log.info('飞书长连接已恢复', { botId: entry.bot.id })
      },
      onError: (error) => {
        if (!isCurrent()) return
        entry.fatal = true
        entry.status = { state: 'error', message: error.message, since: Date.now() }
        log.warn('飞书长连接异常', { botId: entry.bot.id, error: error.message })
      },
      onMessage: (payload) => {
        if (!isCurrent()) return
        const result = handleFeishuWsEvent({ bot: entry.bot, payload })
        if (result.kind !== 'event') {
          log.debug('忽略飞书长连接事件', { botId: entry.bot.id, kind: result.kind })
          return
        }
        log.debug('收到飞书消息', {
          botId: entry.bot.id,
          chatId: result.event.chatId,
          chatType: result.event.chatType,
          textLength: result.event.text.length,
        })
        void this.options.dispatcher.accept(result.event).catch((error) => {
          log.error('处理飞书消息失败', { botId: entry.bot.id, error })
        })
      },
    }
  }

  private closeSocket(entry: ConnectionEntry): void {
    if (!entry.socket) return
    try {
      entry.socket.close()
    } catch (error) {
      log.warn('关闭飞书长连接失败', { botId: entry.bot.id, error })
    }
    entry.socket = null
  }
}
