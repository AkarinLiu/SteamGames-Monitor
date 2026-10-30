import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/database'
import type { BotAppRow, UserRow } from '../../db/rows'
import type { InboundEvent } from '../types'
import type {
  WecomEventSink,
  WecomLongConnectionManager,
  WecomSocket,
  WecomSocketFactory,
  WecomSocketHandlers,
} from './manager'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

class FakeSocket implements WecomSocket {
  connected = false
  disconnected = false
  replies: Array<{ reqId: string; content: string }> = []
  sent: Array<{ chatId: string; chatType: 'single' | 'group'; content: string }> = []
  readonly handlers: WecomSocketHandlers

  constructor(
    readonly botId: string,
    readonly secret: string,
    handlers: WecomSocketHandlers,
  ) {
    this.handlers = handlers
  }

  connect(): void {
    this.connected = true
  }

  disconnect(): void {
    this.disconnected = true
  }

  isConnected(): boolean {
    return this.connected
  }

  async reply(reqId: string, content: string): Promise<void> {
    this.replies.push({ reqId, content })
  }

  async sendMessage(
    chatId: string,
    chatType: 'single' | 'group',
    content: string,
  ): Promise<void> {
    this.sent.push({ chatId, chatType, content })
  }
}

describe('WecomLongConnectionManager', () => {
  let db: Db
  let user: UserRow
  let bot: BotAppRow
  let manager: WecomLongConnectionManager
  let sockets: FakeSocket[]
  let events: InboundEvent[]

  beforeEach(async () => {
    const { openDatabase } = await import('../../db/database')
    const { createUser } = await import('../../db/repo/users')
    const { createBot } = await import('../../db/repo/bots')
    const { encryptConfig, botAad } = await import('../../notify/secrets')
    const { WecomLongConnectionManager } = await import('./manager')

    db = openDatabase(':memory:')
    user = createUser(db, {
      username: 'owner',
      displayName: 'Owner',
      passwordHash: 'x',
      role: 'admin',
      region: 'cn',
      language: 'schinese',
      timezone: 'Asia/Shanghai',
      onboardedAt: Date.now(),
      mustChangePassword: false,
    })
    bot = createBot(db, {
      userId: user.id,
      platform: 'wecom',
      name: '企微机器人',
      webhookSlug: 'wecom-test',
      enabled: true,
      configEnc: encryptConfig(
        { botId: 'bot-1', secret: 'secret-1', ownerPlatformUserId: 'zhangsan' },
        botAad(user.id, 'wecom'),
      ),
      keyVersion: 1,
    })

    sockets = []
    events = []
    const dispatcher: WecomEventSink = {
      accept: async (event) => {
        events.push(event)
        return {}
      },
    }
    const createSocket: WecomSocketFactory = ({ botId, secret, handlers }) => {
      const socket = new FakeSocket(botId, secret, handlers)
      sockets.push(socket)
      return socket
    }
    manager = new WecomLongConnectionManager({ db, dispatcher, createSocket })
  })

  afterEach(() => {
    manager.stop()
    db.close()
  })

  it('为启用的机器人建立一条长连接并暴露连接状态', () => {
    manager.start()
    expect(sockets).toHaveLength(1)
    expect(sockets[0]?.connected).toBe(true)
    expect(sockets[0]?.botId).toBe('bot-1')
    expect(manager.statusFor(bot.id).state).toBe('connecting')

    sockets[0]!.handlers.onAuthenticated()
    expect(manager.statusFor(bot.id).state).toBe('connected')
  })

  it('接收消息后写入 dispatcher，并通过长连接回复', async () => {
    manager.start()
    sockets[0]!.handlers.onAuthenticated()
    sockets[0]!.handlers.onMessage({
      cmd: 'aibot_msg_callback',
      headers: { req_id: 'req-1' },
      body: {
        msgid: 'msg-1',
        chattype: 'single',
        from: { userid: 'zhangsan' },
        msgtype: 'text',
        text: { content: '/help' },
      },
    })
    await Promise.resolve()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'wecom',
      text: '/help',
      reply: { type: 'wecom', reqId: 'req-1' },
    })

    const target = events[0]?.reply
    if (!target || target.type !== 'wecom') throw new Error('缺少企业微信回复目标')
    const result = await manager.sendReply(bot.id, target, '/help 的结果')
    expect(result.ok).toBe(true)
    expect(sockets[0]!.replies).toEqual([
      { reqId: 'req-1', content: '/help 的结果' },
    ])
  })

  it('停用机器人后断开并移除连接', async () => {
    manager.start()
    const socket = sockets[0]!
    const { updateBot } = await import('../../db/repo/bots')
    updateBot(db, bot.id, { enabled: false })
    manager.sync()

    expect(socket.disconnected).toBe(true)
    expect(manager.statusFor(bot.id).state).toBe('disconnected')
  })

  it('缺少 Bot ID / Secret 时标记配置错误', async () => {
    const { createBot, updateBot } = await import('../../db/repo/bots')
    const { encryptConfig, botAad } = await import('../../notify/secrets')
    updateBot(db, bot.id, { enabled: false })
    const emptyBot = createBot(db, {
      userId: user.id,
      platform: 'wecom',
      name: '未配置机器人',
      webhookSlug: 'wecom-empty',
      enabled: true,
      configEnc: encryptConfig({ ownerPlatformUserId: 'lisi' }, botAad(user.id, 'wecom')),
      keyVersion: 1,
    })
    manager.start()

    expect(sockets).toHaveLength(0)
    expect(manager.statusFor(emptyBot.id)).toMatchObject({
      state: 'error',
      message: '请填写 Bot ID 和 Secret',
    })
  })

  it('通过长连接向最近会话主动推送事件', async () => {
    manager.start()
    sockets[0]!.handlers.onAuthenticated()
    const result = await manager.sendEvent(
      bot.id,
      { chatId: 'chat-1', chatType: 'group' },
      '促销开始',
    )
    expect(result.ok).toBe(true)
    expect(sockets[0]!.sent).toEqual([
      { chatId: 'chat-1', chatType: 'group', content: '促销开始' },
    ])
  })

  it('认证失败后断开事件不会覆盖异常状态', () => {
    manager.start()
    const handlers = sockets[0]!.handlers
    handlers.onError(new Error('Authentication failed: invalid bot_id or secret (code: 853000)'))
    handlers.onDisconnected('code: 1006')
    handlers.onReconnecting(4)

    expect(manager.statusFor(bot.id)).toMatchObject({
      state: 'error',
      message: 'Authentication failed: invalid bot_id or secret (code: 853000)',
    })
  })

  it('长连接未连接时返回可重试错误', async () => {
    manager.start()
    const result = await manager.sendReply(
      bot.id,
      { type: 'wecom', reqId: 'req-1', chatId: 'zhangsan', chatType: 'single' },
      'hello',
    )
    expect(result.ok).toBe(false)
    expect(result.retryAfterMs).toBe(30_000)
  })
})
