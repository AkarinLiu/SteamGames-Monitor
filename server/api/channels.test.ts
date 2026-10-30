import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppBindings } from './context'

process.env.NODE_ENV = 'test'
process.env.ALLOW_INSECURE_WEBHOOKS = '1'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

type Db = import('../db/database').Db

describe('channel API', () => {
  let db: Db
  let app: Hono<AppBindings>
  let server: ReturnType<typeof createServer> | null = null
  let baseUrl = ''

  async function bootstrap() {
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
      checkMonitor: async () => ({ monitorId: 0, status: 'skipped', eventsCreated: 0, deliveriesCreated: 0 }),
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
    server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ errcode: 0 }))
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    await bootstrap()
  })

  afterEach(async () => {
    db?.close()
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = null
    }
  })

  it('creates a channel without echoing the webhook or secret', async () => {
    const { cookie } = await loginAs('member', 'alice')
    const response = await api('/channels', cookie, {
      method: 'POST',
      body: JSON.stringify({
        type: 'feishu_bot',
        name: '飞书群',
        config: { webhookUrl: `${baseUrl}/feishu`, secret: 'top-secret' },
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      channel: { config: Record<string, unknown> }
    }
    expect(JSON.stringify(body)).not.toContain('top-secret')
    expect(JSON.stringify(body)).not.toContain(baseUrl)
    expect(body.channel.config.webhookSet).toBe(true)
    expect(body.channel.config.secretSet).toBe(true)
  })

  it('keeps existing secrets when patching without replacement', async () => {
    const { user, cookie } = await loginAs('member', 'alice')
    const created = await api('/channels', cookie, {
      method: 'POST',
      body: JSON.stringify({
        type: 'dingtalk_bot',
        name: '钉钉群',
        config: { webhookUrl: `${baseUrl}/dingtalk`, secret: 'keep-me' },
      }),
    })
    const { channel } = (await created.json()) as { channel: { id: number } }
    const patched = await api(`/channels/${channel.id}`, cookie, {
      method: 'PATCH',
      body: JSON.stringify({ name: '改名', config: { webhookUrl: `${baseUrl}/v2` } }),
    })
    expect(patched.status).toBe(200)

    const { findChannelById } = await import('../db/repo/channels')
    const { decryptConfig, channelAad } = await import('../notify/secrets')
    const row = findChannelById(db, channel.id)!
    const config = decryptConfig<{ webhookUrl: string; secret: string }>(
      row.config_enc,
      channelAad(user.id, row.type),
    )
    expect(config.secret).toBe('keep-me')
    expect(config.webhookUrl).toBe(`${baseUrl}/v2`)
  })

  it('creates a custom webhook channel and hides its secrets', async () => {
    const { cookie } = await loginAs('member', 'alice')
    const created = await api('/channels', cookie, {
      method: 'POST',
      body: JSON.stringify({
        type: 'webhook',
        name: '自定义 WebHook',
        config: {
          webhookUrl: `${baseUrl}/webhook`,
          secret: 'webhook-secret',
          authorization: 'Bearer test-token',
        },
      }),
    })
    expect(created.status).toBe(201)
    const { channel } = (await created.json()) as { channel: { id: number } }

    const test = await api(`/channels/${channel.id}/test`, cookie, {
      method: 'POST',
      body: '{}',
    })
    expect(test.status).toBe(200)
    expect(await test.json()).toMatchObject({ ok: true })

    const list = await api('/channels', cookie)
    const body = (await list.json()) as {
      items: Array<{ config: Record<string, unknown> }>
    }
    expect(body.items[0]?.config).toMatchObject({
      webhookHost: `127.0.0.1:${new URL(baseUrl).port}`,
      webhookSet: true,
      secretSet: true,
      authorizationSet: true,
    })
    expect(JSON.stringify(body.items[0]?.config)).not.toContain('webhook-secret')
    expect(JSON.stringify(body.items[0]?.config)).not.toContain('Bearer test-token')
  })

  it('sends a synchronous test message and records the result', async () => {
    const { cookie } = await loginAs('member', 'alice')
    const created = await api('/channels', cookie, {
      method: 'POST',
      body: JSON.stringify({
        type: 'wecom_bot',
        name: '企微群',
        config: { webhookUrl: `${baseUrl}/wecom` },
      }),
    })
    const { channel } = (await created.json()) as { channel: { id: number } }
    const test = await api(`/channels/${channel.id}/test`, cookie, { method: 'POST', body: '{}' })
    const body = (await test.json()) as { ok: boolean; latencyMs: number }
    expect(test.status).toBe(200)
    expect(body.ok).toBe(true)
    const row = db.prepare('SELECT last_test_ok FROM notification_channels WHERE id = ?').get(
      channel.id,
    ) as { last_test_ok: number }
    expect(row.last_test_ok).toBe(1)
  })

  it('isolates channels between users', async () => {
    const a = await loginAs('member', 'alice')
    const b = await loginAs('member', 'bob')
    const created = await api('/channels', a.cookie, {
      method: 'POST',
      body: JSON.stringify({
        type: 'wecom_bot',
        name: 'A 的群',
        config: { webhookUrl: `${baseUrl}/a` },
      }),
    })
    const { channel } = (await created.json()) as { channel: { id: number } }

    const listB = await api('/channels', b.cookie)
    const bodyB = (await listB.json()) as { items: unknown[] }
    expect(bodyB.items).toHaveLength(0)

    const patchB = await api(`/channels/${channel.id}`, b.cookie, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'hijack' }),
    })
    expect(patchB.status).toBe(404)
    const deleteB = await api(`/channels/${channel.id}`, b.cookie, { method: 'DELETE' })
    expect(deleteB.status).toBe(404)
  })

  it('requires authentication', async () => {
    const response = await app.request('/api/channels')
    expect(response.status).toBe(401)
  })
})
