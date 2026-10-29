import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/database'
import type { BotAppRow, UserRow } from '../db/rows'
import type { InboundDispatcher as Dispatcher } from './dispatcher'
import type { CommandServices } from './commands/executor'
import type { InboundEvent } from './types'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('等待超时')
}

describe('InboundDispatcher', () => {
  let db: Db
  let user: UserRow
  let bot: BotAppRow
  let dispatcher: Dispatcher
  let services: CommandServices

  async function build(maxPerMinute?: { user: number; chat: number; bot: number }) {
    const { InboundDispatcher } = await import('./dispatcher')
    dispatcher = new InboundDispatcher({ db, services, maxPerMinute })
  }

  function event(overrides: Partial<InboundEvent> = {}): InboundEvent {
    return {
      platform: 'feishu',
      botApp: bot,
      ownerUserId: user.id,
      platformMessageId: 'msg-1',
      chatId: 'chat-1',
      platformUserId: 'ou_owner',
      userName: null,
      text: '/help',
      reply: { type: 'feishu', messageId: 'om-1', chatId: 'chat-1' },
      receivedAt: Date.now(),
      ...overrides,
    }
  }

  function commandLogs(): Array<{ command: string; result: string }> {
    return db
      .prepare('SELECT command, result FROM command_logs ORDER BY id ASC')
      .all() as unknown as Array<{ command: string; result: string }>
  }

  beforeEach(async () => {
    const { openDatabase } = await import('../db/database')
    const { createUser } = await import('../db/repo/users')
    const { createBot, upsertAllowlistEntry } = await import('../db/repo/bots')
    const { encryptConfig, botAad } = await import('../notify/secrets')
    const { SteamRateLimiter } = await import('../monitor/rateLimiter')

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
      platform: 'feishu',
      name: '飞书机器人',
      webhookSlug: 'feishu-test',
      enabled: true,
      configEnc: encryptConfig({ ownerPlatformUserId: 'ou_owner' }, botAad(user.id, 'feishu')),
      keyVersion: 1,
    })
    upsertAllowlistEntry(db, bot.id, 'ou_viewer', '查看者', 'viewer')
    services = {
      db,
      limiter: new SteamRateLimiter(),
      cacheTtlMs: 600_000,
      maxTotalMonitors: 2000,
      checkMonitor: async () => ({
        monitorId: 0,
        status: 'skipped',
        eventsCreated: 0,
        deliveriesCreated: 0,
      }),
    }
    await build()
  })

  it('所有者隐式 admin，可执行指令并写入审计与回复投递', async () => {
    const accepted = await dispatcher.accept(event())
    expect(accepted.duplicate).toBe(false)
    await waitFor(() => {
      const row = db
        .prepare('SELECT status FROM inbound_messages WHERE id = ?')
        .get(accepted.inboundId) as { status: string } | undefined
      return row?.status === 'processed'
    })
    expect(commandLogs()).toEqual([{ command: 'help', result: 'ok' }])
    const delivery = db
      .prepare("SELECT kind, payload_json FROM deliveries WHERE kind = 'command'")
      .get() as { kind: string; payload_json: string } | undefined
    expect(delivery?.kind).toBe('command')
    expect(delivery?.payload_json).toContain('Steam 销售监控指令')
  })

  it('重复平台消息只处理一次', async () => {
    const first = await dispatcher.accept(event())
    const second = await dispatcher.accept(event())
    expect(second.duplicate).toBe(true)
    expect(second.inboundId).toBe(first.inboundId)
    await waitFor(() => commandLogs().length === 1)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(commandLogs()).toHaveLength(1)
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM inbound_messages')
      .get() as { n: number }
    expect(Number(count.n)).toBe(1)
  })

  it('白名单查看者只读，写指令被拒绝', async () => {
    const denied = await dispatcher.handleInline(
      event({ platformUserId: 'ou_viewer', text: '/add 1091500' }),
    )
    expect(denied.join(' ')).toContain('未授权：查看者只能使用')

    const allowed = await dispatcher.handleInline(
      event({ platformUserId: 'ou_viewer', text: '/list', platformMessageId: 'msg-2' }),
    )
    expect(allowed.join(' ')).toContain('暂无监控项')
  })

  it('未授权用户收到允许名单提示', async () => {
    const lines = await dispatcher.handleInline(event({ platformUserId: 'ou_stranger' }))
    expect(lines.join(' ')).toContain('未授权，请联系机器人所有者')
  })

  it('忽略非指令文本与停用的机器人', async () => {
    expect(await dispatcher.handleInline(event({ text: 'hello' }))).toEqual([])

    const { updateBot } = await import('../db/repo/bots')
    updateBot(db, bot.id, { enabled: false })
    expect(await dispatcher.handleInline(event({ text: '/help' }))).toEqual([])
  })

  it('按用户维度限流，并且只提醒一次', async () => {
    await build({ user: 2, chat: 100, bot: 100 })
    const first = await dispatcher.handleInline(event({ platformMessageId: 'a' }))
    const second = await dispatcher.handleInline(event({ platformMessageId: 'b' }))
    const third = await dispatcher.handleInline(event({ platformMessageId: 'c' }))
    const fourth = await dispatcher.handleInline(event({ platformMessageId: 'd' }))
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
    expect(third.join(' ')).toContain('操作过于频繁')
    expect(fourth).toEqual([])
  })
})
