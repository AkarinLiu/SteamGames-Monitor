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
    upsertAllowlistEntry(db, bot.id, 'ou_owner', 'Owner', 'admin')
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

  it('允许名单管理员可执行指令并写入审计与回复投递', async () => {
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

  it('记录授权用户最近使用的会话作为事件通知目标', async () => {
    await dispatcher.handleInline(event({ text: '/help' }))
    const row = db
      .prepare('SELECT last_channel, last_chat_id, last_chat_at FROM bot_apps WHERE id = ?')
      .get(bot.id) as {
      last_channel: string | null
      last_chat_id: string | null
      last_chat_at: number | null
    }
    expect(row.last_channel).toBe('chat')
    expect(row.last_chat_id).toBe('chat-1')
    expect(row.last_chat_at).toBeGreaterThan(0)
  })

  it('未授权用户收到网页授权链接且不执行指令', async () => {
    const lines = await dispatcher.handleInline(
      event({ platformUserId: 'ou_stranger', text: '/add 1091500' }),
    )
    expect(lines.join('\n')).toContain('/authorize/')
    expect(lines.join('\n')).toContain('机器人所有者')
    expect(lines.join('\n')).not.toContain('已添加监控')
  })

  it('所有者平台 ID 未加入允许名单时也不能直接执行指令', async () => {
    const { deleteAllowlistEntry } = await import('../db/repo/bots')
    deleteAllowlistEntry(db, bot.id, 'ou_owner')

    const lines = await dispatcher.handleInline(event({ text: '/help' }))
    expect(lines.join('\n')).toContain('/authorize/')
    expect(lines.join('\n')).not.toContain('Steam 销售监控指令')
  })

  it('企业微信未授权用户收到网页授权链接', async () => {
    const { createBot } = await import('../db/repo/bots')
    const { encryptConfig, botAad } = await import('../notify/secrets')
    const wecomBot = createBot(db, {
      userId: user.id,
      platform: 'wecom',
      name: '企微机器人',
      webhookSlug: 'wecom-deny-test',
      enabled: true,
      configEnc: encryptConfig(
        { botId: 'bot-deny', secret: 'secret-deny' },
        botAad(user.id, 'wecom'),
      ),
      keyVersion: 1,
    })
    const lines = await dispatcher.handleInline(
      event({
        platform: 'wecom',
        botApp: wecomBot,
        platformMessageId: 'wecom-denied-1',
        platformUserId: 'zhangsan',
      }),
    )
    expect(lines.join('\n')).toContain('/authorize/')
    expect(lines.join('\n')).toContain('机器人所有者')
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

  it('机器人回复跟随账号 UI 语言', async () => {
    const { updateUser } = await import('../db/repo/users')
    updateUser(db, user.id, { uiLocale: 'en' })

    const help = await dispatcher.handleInline(event({ text: '/help' }))
    expect(help.join('\n')).toContain('Steam Sales Monitor commands')
    expect(help.join('\n')).not.toContain('Steam 销售监控指令')

    const unknown = await dispatcher.handleInline(
      event({ platformMessageId: 'msg-en-2', text: '/nope' }),
    )
    expect(unknown.join(' ')).toContain('Unknown command /nope')

    const { createMonitor } = await import('../db/repo/monitors')
    createMonitor(db, {
      userId: user.id,
      appid: 123,
      kind: 'game',
      name: 'English Monitor',
      storeUrl: 'https://store.steampowered.com/app/123/',
      region: 'cn',
      language: 'schinese',
      nextCheckAt: Date.now() + 60_000,
    })
    const listed = await dispatcher.handleInline(
      event({ platformMessageId: 'msg-en-3', text: '/list --all' }),
    )
    expect(listed.join('\n')).toContain('Monitors (page 1, 1 total):')
    expect(listed.join('\n')).toContain('English Monitor')

    const denied = await dispatcher.handleInline(
      event({
        platformUserId: 'ou_viewer',
        platformMessageId: 'msg-en-4',
        text: '/add 1091500',
      }),
    )
    expect(denied.join(' ')).toContain('Not authorized')
  })
})
