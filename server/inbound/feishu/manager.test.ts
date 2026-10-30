import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../db/database'
import type { BotAppRow, UserRow } from '../../db/rows'
import type { InboundEvent } from '../types'
import type {
  FeishuEventSink,
  FeishuLongConnectionManager,
  FeishuSocket,
  FeishuSocketFactory,
  FeishuSocketHandlers,
} from './manager'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

class FakeSocket implements FeishuSocket {
  started = false
  closed = false
  readonly handlers: FeishuSocketHandlers

  constructor(
    readonly appId: string,
    readonly appSecret: string,
    readonly brand: 'feishu' | 'lark',
    handlers: FeishuSocketHandlers,
  ) {
    this.handlers = handlers
  }

  start(): void {
    this.started = true
  }

  close(): void {
    this.closed = true
  }
}

describe('FeishuLongConnectionManager', () => {
  let db: Db
  let user: UserRow
  let manager: FeishuLongConnectionManager
  let sockets: FakeSocket[]
  let events: InboundEvent[]

  async function createFeishuBot(
    config: Record<string, unknown>,
    enabled = true,
  ): Promise<BotAppRow> {
    const { createBot } = await import('../../db/repo/bots')
    const { encryptConfig, botAad } = await import('../../notify/secrets')
    return createBot(db, {
      userId: user.id,
      platform: 'feishu',
      name: '飞书机器人',
      webhookSlug: `feishu-${Math.random().toString(36).slice(2)}`,
      enabled,
      configEnc: encryptConfig(
        { appId: 'cli_manager', appSecret: 'manager-secret', ...config },
        botAad(user.id, 'feishu'),
      ),
      keyVersion: 1,
    })
  }

  beforeEach(async () => {
    const { openDatabase } = await import('../../db/database')
    const { createUser } = await import('../../db/repo/users')
    const { FeishuLongConnectionManager } = await import('./manager')

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

    sockets = []
    events = []
    const dispatcher: FeishuEventSink = {
      accept: async (event) => {
        events.push(event)
        return {}
      },
    }
    const createSocket: FeishuSocketFactory = ({ appId, appSecret, brand, handlers }) => {
      const socket = new FakeSocket(appId, appSecret, brand, handlers)
      sockets.push(socket)
      return socket
    }
    manager = new FeishuLongConnectionManager({ db, dispatcher, createSocket })
  })

  afterEach(() => {
    manager.stop()
    db.close()
  })

  it('仅为启用且使用长连接的飞书机器人建立连接', async () => {
    const websocket = await createFeishuBot({ connectionMode: 'websocket' })
    await createFeishuBot({ connectionMode: 'webhook' }, false)

    manager.start()
    expect(sockets).toHaveLength(1)
    expect(sockets[0]?.appId).toBe('cli_manager')
    expect(sockets[0]?.brand).toBe('feishu')
    expect(sockets[0]?.started).toBe(true)
    expect(manager.statusFor(websocket.id).state).toBe('connecting')

    sockets[0]?.handlers.onReady()
    expect(manager.statusFor(websocket.id).state).toBe('connected')

    manager.sync()
    expect(sockets).toHaveLength(1)
  })

  it('Lark 品牌使用 lark 连接域', async () => {
    await createFeishuBot({ connectionMode: 'websocket', brand: 'lark' })
    manager.start()
    expect(sockets[0]?.brand).toBe('lark')
  })

  it('将长连接消息交给指令调度器', async () => {
    const bot = await createFeishuBot({ connectionMode: 'websocket' })
    manager.start()
    const socket = sockets[0]!

    // The official SDK flattens v2 envelopes: header and event fields are top-level.
    socket.handlers.onMessage({
      schema: '2.0',
      event_type: 'im.message.receive_v1',
      event_id: 'evt-1',
      token: 'verification-token',
      sender: { sender_type: 'user', sender_id: { open_id: 'ou_sender' } },
      message: {
        message_id: 'om_1',
        chat_id: 'oc_1',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '/help' }),
      },
    })

    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({
      platform: 'feishu',
      platformMessageId: 'evt-1',
      platformUserId: 'ou_sender',
      chatId: 'oc_1',
      chatType: 'single',
      text: '/help',
    })
    expect(events[0]?.botApp.id).toBe(bot.id)
  })

  it('机器人停用后关闭长连接', async () => {
    const bot = await createFeishuBot({ connectionMode: 'websocket' })
    manager.start()
    expect(sockets).toHaveLength(1)

    const { updateBot } = await import('../../db/repo/bots')
    updateBot(db, bot.id, { enabled: false })
    manager.sync()
    expect(sockets[0]?.closed).toBe(true)
    expect(manager.statusFor(bot.id).state).toBe('disconnected')
  })

  it('缺少 App ID / Secret 时显示配置错误', async () => {
    const bot = await createFeishuBot({
      connectionMode: 'websocket',
      appId: '',
      appSecret: '',
    })
    manager.start()
    expect(sockets).toHaveLength(0)
    expect(manager.statusFor(bot.id)).toMatchObject({
      state: 'error',
      message: expect.stringContaining('App ID'),
    })
  })
})
