import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/database'
import type { BotAppRow, UserRow } from '../db/rows'
import type {
  approveBotAuthRequest,
  createBotAuthorizationRequest,
  denyBotAuthRequest,
  getBotAuthRequestInfo,
} from './authorization'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

function tokenFromUrl(url: string): string {
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/')
  return parts[parts.length - 1] ?? ''
}

describe('bot authorization', () => {
  let db: Db
  let owner: UserRow
  let other: UserRow
  let bot: BotAppRow
  let create: typeof createBotAuthorizationRequest
  let info: typeof getBotAuthRequestInfo
  let approve: typeof approveBotAuthRequest
  let deny: typeof denyBotAuthRequest
  const now = 1_700_000_000_000
  const ttl = 30 * 60_000

  beforeEach(async () => {
    const { openDatabase } = await import('../db/database')
    const { createUser } = await import('../db/repo/users')
    const { createBot } = await import('../db/repo/bots')
    const { encryptConfig, botAad } = await import('../notify/secrets')
    const authorization = await import('./authorization')

    create = authorization.createBotAuthorizationRequest
    info = authorization.getBotAuthRequestInfo
    approve = authorization.approveBotAuthRequest
    deny = authorization.denyBotAuthRequest

    db = openDatabase(':memory:')
    owner = createUser(db, {
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
    other = createUser(db, {
      username: 'other',
      displayName: 'Other',
      passwordHash: 'x',
      role: 'member',
      region: 'cn',
      language: 'schinese',
      timezone: 'Asia/Shanghai',
      onboardedAt: Date.now(),
      mustChangePassword: false,
    })
    bot = createBot(db, {
      userId: owner.id,
      platform: 'wecom',
      name: '企微机器人',
      webhookSlug: 'wecom-auth-test',
      enabled: true,
      configEnc: encryptConfig({ botId: 'bot-1', secret: 'secret-1' }, botAad(owner.id, 'wecom')),
      keyVersion: 1,
    })
  })

  afterEach(() => {
    db.close()
  })

  it('创建一次性授权链接并返回请求信息', () => {
    const link = create(db, {
      bot,
      platformUserId: 'zhangsan',
      userName: '张三',
      chatId: 'chat-1',
    }, now)
    const token = tokenFromUrl(link.url)
    expect(link.url).toBe(`http://localhost:8787/authorize/${token}`)
    expect(link.expiresAt).toBe(now + ttl)

    const view = info(db, token, owner.id, now)
    expect(view).toMatchObject({
      status: 'pending',
      canApprove: true,
      botId: bot.id,
      botName: '企微机器人',
      platform: 'wecom',
      platformUserId: 'zhangsan',
      platformUserName: '张三',
      chatId: 'chat-1',
      role: null,
    })
    expect(info(db, token, other.id, now)?.canApprove).toBe(false)

    const stored = db
      .prepare('SELECT token_hash FROM bot_auth_requests WHERE bot_app_id = ?')
      .get(bot.id) as { token_hash: string }
    expect(stored.token_hash).not.toBe(token)
  })

  it('所有者批准后写入允许名单，且重复批准失败', async () => {
    const link = create(db, { bot, platformUserId: 'zhangsan', userName: '张三' }, now)
    const token = tokenFromUrl(link.url)

    expect(() => approve(db, token, other, 'viewer', now)).toThrow('只有机器人所有者')
    const approved = approve(db, token, owner, 'admin', now)
    expect(approved).toMatchObject({ status: 'approved', role: 'admin', canApprove: false })

    const { findAllowlistEntry } = await import('../db/repo/bots')
    expect(findAllowlistEntry(db, bot.id, 'zhangsan')?.role).toBe('admin')
    expect(() => approve(db, token, owner, 'viewer', now)).toThrow('已处理')
  })

  it('拒绝授权不会写入允许名单', async () => {
    const link = create(db, { bot, platformUserId: 'lisi' }, now)
    const token = tokenFromUrl(link.url)
    const denied = deny(db, token, owner, now)
    expect(denied.status).toBe('denied')
    const { findAllowlistEntry } = await import('../db/repo/bots')
    expect(findAllowlistEntry(db, bot.id, 'lisi')).toBeUndefined()
  })

  it('同一用户的多条待处理链接一起完成', () => {
    const first = create(db, { bot, platformUserId: 'zhaoliu' }, now)
    const second = create(db, { bot, platformUserId: 'zhaoliu' }, now + 1)
    const firstToken = tokenFromUrl(first.url)
    const secondToken = tokenFromUrl(second.url)

    approve(db, firstToken, owner, 'viewer', now)
    expect(info(db, firstToken, owner.id, now)?.status).toBe('approved')
    expect(info(db, secondToken, owner.id, now)?.status).toBe('approved')
  })

  it('过期链接不可再批准', () => {
    const link = create(db, { bot, platformUserId: 'wangwu' }, now)
    const token = tokenFromUrl(link.url)
    const later = now + ttl + 1
    expect(info(db, token, owner.id, later)?.status).toBe('expired')
    expect(() => approve(db, token, owner, 'viewer', later)).toThrow('已过期')
  })
})
