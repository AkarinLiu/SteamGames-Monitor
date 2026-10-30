import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppBindings } from './context'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

type Db = import('../db/database').Db

describe('bot authorization API', () => {
  let db: Db
  let app: Hono<AppBindings>

  async function bootstrap(): Promise<void> {
    const { openDatabase } = await import('../db/database')
    db = openDatabase(':memory:')
    const { setSetupCompleted } = await import('../db/repo/settings')
    setSetupCompleted(db, true)
    const { createApp } = await import('../app')
    const { SteamRateLimiter } = await import('../monitor/rateLimiter')
    const runtime = {
      db,
      startedAt: Date.now(),
      limiter: new SteamRateLimiter(),
      scheduler: { running: false, inflightKeyCount: 0 },
      newsScanner: { isRunning: false },
      deliveryWorker: { isRunning: false },
      cacheTtlMs: 600_000,
      checkMonitor: async () => ({
        monitorId: 0,
        status: 'skipped',
        eventsCreated: 0,
        deliveriesCreated: 0,
      }),
    } as unknown as import('../runtime').Runtime
    app = createApp(runtime)
  }

  async function loginAs(role: 'admin' | 'member', username: string) {
    const { createUser } = await import('../db/repo/users')
    const user = createUser(db, {
      username,
      displayName: username,
      passwordHash: 'x',
      role,
      region: 'cn',
      language: 'schinese',
      timezone: 'Asia/Shanghai',
      onboardedAt: Date.now(),
      mustChangePassword: false,
    })
    const { createSession } = await import('../db/repo/sessions')
    const { sha256Hex } = await import('../lib/ids')
    createSession(db, {
      tokenHash: sha256Hex(`tok-${username}`),
      userId: user.id,
      expiresAt: Date.now() + 3_600_000,
    })
    return { user, cookie: `sgm_session=tok-${username}` }
  }

  function api(path: string, cookie: string, init: RequestInit = {}) {
    return app.request(`/api${path}`, {
      ...init,
      headers: {
        origin: 'http://localhost:8787',
        'content-type': 'application/json',
        cookie,
        ...(init.headers as Record<string, string> | undefined),
      },
    })
  }

  beforeEach(async () => {
    await bootstrap()
  })

  afterEach(() => {
    db?.close()
  })

  it('owner can inspect and approve a request; other users cannot approve', async () => {
    const owner = await loginAs('admin', 'owner')
    const member = await loginAs('member', 'member')
    const { createBot } = await import('../db/repo/bots')
    const { encryptConfig, botAad } = await import('../notify/secrets')
    const { createBotAuthorizationRequest } = await import('../bots/authorization')
    const bot = createBot(db, {
      userId: owner.user.id,
      platform: 'wecom',
      name: '企微机器人',
      webhookSlug: 'wecom-api-auth',
      enabled: true,
      configEnc: encryptConfig(
        { botId: 'bot-api', secret: 'secret-api' },
        botAad(owner.user.id, 'wecom'),
      ),
      keyVersion: 1,
    })
    const link = createBotAuthorizationRequest(db, {
      bot,
      platformUserId: 'zhangsan',
      userName: '张三',
    })
    const token = new URL(link.url).pathname.split('/').pop()!

    const ownerView = await api(`/bot-auth/${token}`, owner.cookie)
    expect(ownerView.status).toBe(200)
    expect(await ownerView.json()).toMatchObject({
      status: 'pending',
      canApprove: true,
      botName: '企微机器人',
      platformUserId: 'zhangsan',
    })

    const memberView = await api(`/bot-auth/${token}`, member.cookie)
    expect(memberView.status).toBe(200)
    expect(await memberView.json()).toMatchObject({ canApprove: false })

    const forbidden = await api(`/bot-auth/${token}/approve`, member.cookie, {
      method: 'POST',
      body: JSON.stringify({ role: 'viewer' }),
    })
    expect(forbidden.status).toBe(403)

    const approved = await api(`/bot-auth/${token}/approve`, owner.cookie, {
      method: 'POST',
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(approved.status).toBe(200)
    expect(await approved.json()).toMatchObject({
      status: 'approved',
      role: 'admin',
      canApprove: false,
    })

    const { findAllowlistEntry } = await import('../db/repo/bots')
    expect(findAllowlistEntry(db, bot.id, 'zhangsan')?.role).toBe('admin')

    const repeated = await api(`/bot-auth/${token}/approve`, owner.cookie, {
      method: 'POST',
      body: JSON.stringify({ role: 'viewer' }),
    })
    expect(repeated.status).toBe(409)
  })

  it('returns 404 for an unknown token', async () => {
    const owner = await loginAs('admin', 'owner2')
    const response = await api('/bot-auth/not-a-real-token', owner.cookie)
    expect(response.status).toBe(404)
  })
})
