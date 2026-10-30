import { WSClient } from '@wecom/aibot-node-sdk'
import type { BotConnectionStatus } from '../../../shared/types'
import type { Db } from '../../db/database'
import type { BotAppRow } from '../../db/rows'
import { listEnabledBotsByPlatform } from '../../db/repo/bots'
import { logger } from '../../lib/logger'
import type { SendResult } from '../../notify/types'
import { botAad, decryptConfig } from '../../notify/secrets'
import { splitReply } from '../commands/format'
import type { InboundEvent, WecomBotConfig, WecomReplyTarget } from '../types'
import { parseWecomMessageFrame, type WecomMessageFrame } from './protocol'

const log = logger.child('wecom')

export interface WecomSocketHandlers {
  onAuthenticated: () => void
  onReconnecting: (attempt: number) => void
  onDisconnected: (reason: string) => void
  onError: (error: Error) => void
  onMessage: (frame: WecomMessageFrame) => void
}

export interface WecomSocket {
  connect: () => void
  disconnect: () => void
  isConnected: () => boolean
  reply: (reqId: string, content: string) => Promise<void>
}

export type WecomSocketFactory = (input: {
  botId: string
  secret: string
  handlers: WecomSocketHandlers
}) => WecomSocket

export interface WecomEventSink {
  accept: (event: InboundEvent) => Promise<unknown>
}

export interface WecomLongConnectionManagerOptions {
  db: Db
  dispatcher: WecomEventSink
  createSocket?: WecomSocketFactory
}

interface ConnectionEntry {
  bot: BotAppRow
  configEnc: string
  socket: WecomSocket | null
  status: BotConnectionStatus
  fatal: boolean
}

function failure(error: string, retryAfterMs?: number, permanent = false): SendResult {
  return { ok: false, httpStatus: null, error, retryAfterMs, permanent }
}

function createOfficialSocket(input: {
  botId: string
  secret: string
  handlers: WecomSocketHandlers
}): WecomSocket {
  const client = new WSClient({
    botId: input.botId,
    secret: input.secret,
    heartbeatInterval: 30_000,
    requestTimeout: 15_000,
    maxReconnectAttempts: -1,
    maxAuthFailureAttempts: 3,
    logger: {
      // SDK debug logs include full message bodies; keep them out of app logs.
      debug: () => {},
      info: (message, ...args) => log.debug(message, args.length ? { args } : undefined),
      warn: (message, ...args) => log.warn(message, args.length ? { args } : undefined),
      error: (message, ...args) => log.warn(message, args.length ? { args } : undefined),
    },
  })

  client.on('authenticated', input.handlers.onAuthenticated)
  client.on('reconnecting', input.handlers.onReconnecting)
  client.on('disconnected', input.handlers.onDisconnected)
  client.on('error', input.handlers.onError)
  client.on('message.text', (frame) => {
    input.handlers.onMessage(frame as unknown as WecomMessageFrame)
  })

  return {
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    isConnected: () => client.isConnected,
    reply: async (reqId, content) => {
      await client.reply(
        { headers: { req_id: reqId } },
        { msgtype: 'markdown', markdown: { content } },
      )
    },
  }
}

export class WecomLongConnectionManager {
  private readonly entries = new Map<number, ConnectionEntry>()
  private readonly createSocket: WecomSocketFactory
  private stopping = false

  constructor(private readonly options: WecomLongConnectionManagerOptions) {
    this.createSocket = options.createSocket ?? createOfficialSocket
  }

  start(): void {
    this.stopping = false
    this.sync()
  }

  stop(): void {
    this.stopping = true
    for (const entry of this.entries.values()) {
      this.closeSocket(entry)
    }
    this.entries.clear()
  }

  statusFor(botId: number): BotConnectionStatus {
    return this.entries.get(botId)?.status ?? { state: 'disconnected', since: 0 }
  }

  sync(): void {
    if (this.stopping) return
    const rows = listEnabledBotsByPlatform(this.options.db, 'wecom')
    const active = new Set<number>()

    for (const bot of rows) {
      active.add(bot.id)
      const existing = this.entries.get(bot.id)
      if (existing && existing.configEnc === bot.config_enc) {
        existing.bot = bot
        continue
      }

      if (existing) {
        this.closeSocket(existing)
        this.entries.delete(bot.id)
      }

      let config: WecomBotConfig
      try {
        config = decryptConfig<WecomBotConfig>(
          bot.config_enc,
          botAad(bot.user_id, bot.platform),
        )
      } catch (error) {
        this.entries.set(bot.id, {
          bot,
          configEnc: bot.config_enc,
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

      if (!config.botId || !config.secret) {
        this.entries.set(bot.id, {
          bot,
          configEnc: bot.config_enc,
          socket: null,
          status: {
            state: 'error',
            message: '请填写 Bot ID 和 Secret',
            since: Date.now(),
          },
          fatal: false,
        })
        continue
      }

      const entry: ConnectionEntry = {
        bot,
        configEnc: bot.config_enc,
        socket: null,
        status: { state: 'connecting', since: Date.now() },
        fatal: false,
      }
      try {
        const socket = this.createSocket({
          botId: config.botId,
          secret: config.secret,
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

  async sendReply(
    botId: number,
    target: WecomReplyTarget,
    text: string,
  ): Promise<SendResult> {
    if (!target.reqId) return failure('企业微信回复缺少 req_id', undefined, true)
    const entry = this.entries.get(botId)
    if (!entry) return failure('企业微信长连接未建立', 30_000)
    if (entry.status.state !== 'connected' || !entry.socket?.isConnected()) {
      return failure('企业微信长连接未就绪', 30_000)
    }

    for (const chunk of splitReply(text, 'wecom')) {
      try {
        await entry.socket.reply(target.reqId, chunk)
      } catch (error) {
        return failure(`企业微信回复失败：${(error as Error).message}`, 30_000)
      }
    }
    return { ok: true, httpStatus: null }
  }

  private handlersFor(entry: ConnectionEntry): WecomSocketHandlers {
    const isCurrent = () => this.entries.get(entry.bot.id) === entry
    return {
      onAuthenticated: () => {
        if (!isCurrent()) return
        entry.fatal = false
        entry.status = { state: 'connected', since: Date.now() }
        log.info('长连接已建立', { botId: entry.bot.id })
      },
      onReconnecting: (attempt) => {
        if (!isCurrent() || entry.fatal) return
        entry.status = {
          state: 'connecting',
          message: `正在重连（第 ${attempt} 次）`,
          since: Date.now(),
        }
      },
      onDisconnected: (reason) => {
        if (!isCurrent() || entry.fatal) return
        entry.status = {
          state: reason.includes('New connection')
            ? 'error'
            : 'connecting',
          message: reason || '连接已断开',
          since: Date.now(),
        }
        log.warn('长连接已断开', { botId: entry.bot.id, reason })
      },
      onError: (error) => {
        if (!isCurrent()) return
        if (
          error.name === 'WSAuthFailureError' ||
          error.message.includes('Authentication failed') ||
          error.message.includes('Max auth failure')
        ) {
          entry.fatal = true
        }
        entry.status = { state: 'error', message: error.message, since: Date.now() }
        log.warn('长连接异常', { botId: entry.bot.id, error: error.message })
      },
      onMessage: (frame) => {
        if (!isCurrent()) return
        const event = parseWecomMessageFrame(entry.bot, frame)
        if (!event) return
        void this.options.dispatcher.accept(event).catch((error) => {
          log.error('处理企业微信消息失败', { botId: entry.bot.id, error })
        })
      },
    }
  }

  private closeSocket(entry: ConnectionEntry): void {
    if (!entry.socket) return
    try {
      entry.socket.disconnect()
    } catch (error) {
      log.warn('关闭企业微信长连接失败', { botId: entry.bot.id, error })
    }
    entry.socket = null
  }
}
