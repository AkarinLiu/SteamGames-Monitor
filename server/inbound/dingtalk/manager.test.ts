import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../db/database'
import type { BotAppRow, UserRow } from '../../db/rows'
import type { InboundEvent } from '../types'
import type {
  DingtalkEventSink,
  DingtalkStreamHandlers,
  DingtalkStreamManager,
  DingtalkStreamSocket,
  DingtalkStreamSocketFactory,
} from './manager'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

class FakeSocket implements DingtalkStreamSocket {
  connected = false
  disconnected = false
  acks: string[] = []
  readonly handlers: DingtalkStreamHandlers

  constructor(
    readonly clientId: string,
    readonly clientSecret: string,
    handlers: DingtalkStreamHandlers,
  ) {
    this.handlers = handlers
  }

  connect(): void {}

  disconnect(): void {
    this.disconnected = true
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  ack(messageId: string): void {
    this.acks.push(messageId)
  }
}

describe('DingtalkStreamManager', () => {
  let db: Db
  let user: UserRow
  let manager: DingtalkStreamManager
  let sockets: FakeSocket[]
  let events: InboundEvent[]

  async function createDingtalkBot(
    config: Record<string, unknown>,
    enabled = true,
  ): Promise<BotAppRow> {
    const { createBot } = await import('../../db/repo/bots')
    const { encryptConfig, botAad } = await import('../../notify/secrets')
    return createBot(db, {
      userId: user.id,
      platform: 'dingtalk',
      name: '钉钉机器人',
      webhookSlug: `dingtalk-${Math.random().toString(36).slice(2)}`,
      enabled,
      configEnc: encryptConfig(
        {
          appKey: 'ding-client',
          appSecret: 'ding-secret',
          robotCode: 'ding-client',
          ...config,
        },
        botAad(user.id, 'dingtalk'),
      ),
      keyVersion: 1,
    })
  }

  beforeEach(async () => {
    const { openDatabase } = await import('../../db/database')
    const { createUser } = await import('../../db/repo/users')
    const { DingtalkStreamManager } = await import('./manager')

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
    const dispatcher: DingtalkEventSink = {
      accept: async (event) => {
        events.push(event)
        return {}
      },
    }
    const createSocket: DingtalkStreamSocketFactory = ({
      clientId,
      clientSecret,
      handlers,
    }) => {
      const socket = new FakeSocket(clientId, clientSecret, handlers)
      sockets.push(socket)
      return socket
    }
    manager = new DingtalkStreamManager({ db, dispatcher, createSocket })
  })

  afterEach(() => {
    manager.stop()
    db.close()
  })

  it('仅为启用且使用 Stream 的钉钉机器人建立连接', async () => {
    const bot = await createDingtalkBot({ connectionMode: 'stream' })
    await createDingtalkBot({ connectionMode: 'webhook' }, false)

    manager.start()
    expect(sockets).toHaveLength(1)
    expect(sockets[0]?.clientId).toBe('ding-client')
    expect(manager.statusFor(bot.id).state).toBe('connecting')

    sockets[0]!.connected = true
    sockets[0]!.handlers.onConnected()
    expect(manager.statusFor(bot.id).state).toBe('connected')
  })

  it('HTTP 回调模式的钉钉机器人不会建立 Stream 连接', async () => {
    await createDingtalkBot({ connectionMode: 'webhook' })
    manager.start()
    expect(sockets).toHaveLength(0)
  })

  it('确认消息并将 Stream 消息交给指令调度器', async () => {
    const bot = await createDingtalkBot({ connectionMode: 'stream' })
    manager.start()
    const socket = sockets[0]!

    socket.handlers.onMessage({
      messageId: 'stream-delivery-1',
      data: JSON.stringify({
        msgtype: 'text',
        text: { content: '/help' },
        senderStaffId: 'staff-1',
        senderId: 'sender-1',
        senderNick: '张三',
        conversationId: 'cid-1',
        conversationType: '1',
        msgId: 'msg-1',
        sessionWebhook: 'https://oapi.dingtalk.com/robot/sendBySession?session=x',
        sessionWebhookExpiredTime: Date.now() + 60_000,
        robotCode: 'ding-client',
      }),
    })

    expect(socket.acks).toEqual(['stream-delivery-1'])
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({
      platform: 'dingtalk',
      platformMessageId: 'msg-1',
      platformUserId: 'staff-1',
      chatId: 'cid-1',
      chatType: 'single',
      text: '/help',
    })
    expect(events[0]?.botApp.id).toBe(bot.id)
    expect(events[0]?.reply).toMatchObject({
      type: 'dingtalk',
      userId: 'staff-1',
      robotCode: 'ding-client',
    })
  })

  it('机器人停用后关闭 Stream 连接', async () => {
    const bot = await createDingtalkBot({ connectionMode: 'stream' })
    manager.start()
    expect(sockets).toHaveLength(1)

    const { updateBot } = await import('../../db/repo/bots')
    updateBot(db, bot.id, { enabled: false })
    manager.sync()
    expect(sockets[0]?.disconnected).toBe(true)
    expect(manager.statusFor(bot.id).state).toBe('disconnected')
  })

  it('缺少 App Key / Secret 时显示配置错误', async () => {
    const bot = await createDingtalkBot({
      connectionMode: 'stream',
      appKey: '',
      appSecret: '',
    })
    manager.start()
    expect(sockets).toHaveLength(0)
    expect(manager.statusFor(bot.id)).toMatchObject({
      state: 'error',
      message: expect.stringContaining('App Key'),
    })
  })
})
