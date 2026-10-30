import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../db/database'
import type { UserRow } from '../../db/rows'
import type { FeishuBotConfig } from '../types'
import type { FeishuQrService as FeishuQrServiceType } from './qr'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('FeishuQrService', () => {
  let db: Db
  let user: UserRow
  let service: FeishuQrServiceType
  let now: number
  let pollPayload: Record<string, unknown>
  let verificationUrl: string
  let fetchMock: ReturnType<typeof vi.fn>
  let requests: Array<{ url: string; body: string }>

  beforeEach(async () => {
    const { openDatabase } = await import('../../db/database')
    const { createUser } = await import('../../db/repo/users')
    const { FeishuQrService } = await import('./qr')

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
    now = 1_700_000_000_000
    pollPayload = { error: 'authorization_pending' }
    verificationUrl = 'https://open.feishu.cn/page/launcher?user_code=ABCD-EFGH'
    requests = []
    fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(
      async (input, init) => {
        const url = String(input)
        const body = String(init?.body ?? '')
        requests.push({ url, body })
        const params = new URLSearchParams(body)
        if (params.get('action') === 'init') {
          return jsonResponse({ supported_auth_methods: ['client_secret'] })
        }
        if (params.get('action') === 'begin') {
          return jsonResponse({
            device_code: 'device-1',
            verification_uri_complete: verificationUrl,
            expires_in: 600,
            interval: 5,
          })
        }
        if (params.get('action') === 'poll') {
          return jsonResponse(pollPayload)
        }
        throw new Error(`unexpected registration request: ${url} ${body}`)
      },
    )
    service = new FeishuQrService(db, {
      now: () => now,
      fetch: fetchMock as unknown as typeof fetch,
    })
  })

  afterEach(() => {
    service.stop()
    db.close()
  })

  it('生成飞书二维码并在扫码成功后创建长连接机器人', async () => {
    const session = await service.start(user.id, '飞书监控机器人', 'feishu')
    expect(session.sessionId).toBeTruthy()
    expect(session.brand).toBe('feishu')
    expect(session.intervalMs).toBe(5_000)
    expect(session.expiresAt).toBe(now + 10 * 60_000)
    expect(session.qrDataUrl).toMatch(/^data:image\/png;base64,/)

    const begin = requests.find((item) => item.body.includes('action=begin'))
    expect(begin?.url).toBe('https://accounts.feishu.cn/oauth/v1/app/registration')
    expect(begin?.body).toContain('archetype=PersonalAgent')

    now += 5_000
    const pending = await service.poll(user.id, session.sessionId)
    expect(pending).toMatchObject({ status: 'pending', brand: 'feishu' })

    pollPayload = {
      client_id: 'cli_feishu_1',
      client_secret: 'feishu-secret-1',
      user_info: { open_id: 'ou_owner', tenant_brand: 'feishu' },
    }
    now += 5_000
    const success = await service.poll(user.id, session.sessionId)
    expect(success).toMatchObject({
      status: 'success',
      enabled: true,
      brand: 'feishu',
      ownerPlatformUserId: 'ou_owner',
    })

    const { findBotByIdInternal } = await import('../../db/repo/bots')
    const row = findBotByIdInternal(db, success.botId!)
    expect(row?.platform).toBe('feishu')
    expect(row?.enabled).toBe(1)

    const { decryptConfig, botAad } = await import('../../notify/secrets')
    const config = decryptConfig<FeishuBotConfig>(
      row!.config_enc,
      botAad(user.id, 'feishu'),
    )
    expect(config).toEqual({
      appId: 'cli_feishu_1',
      appSecret: 'feishu-secret-1',
      brand: 'feishu',
      connectionMode: 'websocket',
      ownerPlatformUserId: 'ou_owner',
    })
  })

  it('Lark 版本使用 accounts.larksuite.com 并创建 Lark 机器人', async () => {
    verificationUrl = 'https://open.larksuite.com/page/launcher?user_code=LARK-CODE'
    pollPayload = {
      client_id: 'cli_lark_1',
      client_secret: 'lark-secret-1',
      user_info: { open_id: 'ou_lark', tenant_brand: 'lark' },
    }

    const session = await service.start(user.id, 'Lark 机器人', 'lark')
    expect(session.brand).toBe('lark')
    expect(session.qrDataUrl).toMatch(/^data:image\/png;base64,/)

    now += 5_000
    const success = await service.poll(user.id, session.sessionId)
    expect(success).toMatchObject({ status: 'success', brand: 'lark' })

    const begin = requests.find((item) => item.body.includes('action=begin'))
    expect(begin?.url).toBe('https://accounts.larksuite.com/oauth/v1/app/registration')
  })

  it('飞书二维码被 Lark 租户扫描时切换到 Lark 授权域', async () => {
    const session = await service.start(user.id)
    pollPayload = { user_info: { tenant_brand: 'lark' } }

    now += 5_000
    const switched = await service.poll(user.id, session.sessionId)
    expect(switched).toMatchObject({ status: 'pending', brand: 'lark' })

    pollPayload = {
      client_id: 'cli_switched',
      client_secret: 'lark-secret',
      user_info: { open_id: 'ou_switch', tenant_brand: 'lark' },
    }
    now += 5_000
    const success = await service.poll(user.id, session.sessionId)
    expect(success).toMatchObject({ status: 'success', brand: 'lark' })

    const polls = requests.filter((item) => item.body.includes('action=poll'))
    expect(polls.at(-1)?.url).toBe('https://accounts.larksuite.com/oauth/v1/app/registration')
  })

  it('二维码过期后返回 expired，且不再请求授权服务', async () => {
    const session = await service.start(user.id)
    now += 10 * 60_000 + 1
    const callsBefore = fetchMock.mock.calls.length
    const result = await service.poll(user.id, session.sessionId)
    expect(result.status).toBe('expired')
    expect(fetchMock.mock.calls.length).toBe(callsBefore)
  })

  it('用户拒绝授权时返回 failed', async () => {
    const session = await service.start(user.id)
    pollPayload = { error: 'access_denied', error_description: 'user denied' }
    now += 5_000
    const result = await service.poll(user.id, session.sessionId)
    expect(result.status).toBe('failed')
    expect(result.message).toContain('拒绝授权')
  })

  it('仅允许会话所属用户查询', async () => {
    const { createUser } = await import('../../db/repo/users')
    const other = createUser(db, {
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
    const session = await service.start(user.id)
    await expect(service.poll(other.id, session.sessionId)).rejects.toThrow('扫码会话')
  })

  it('已有启用中的飞书机器人时拒绝再次扫码', async () => {
    const { createBot } = await import('../../db/repo/bots')
    const { encryptConfig, botAad } = await import('../../notify/secrets')
    createBot(db, {
      userId: user.id,
      platform: 'feishu',
      name: '已有机器人',
      webhookSlug: 'existing-feishu',
      enabled: true,
      configEnc: encryptConfig(
        { appId: 'cli_existing', appSecret: 'secret-existing' },
        botAad(user.id, 'feishu'),
      ),
      keyVersion: 1,
    })
    await expect(service.start(user.id)).rejects.toThrow('请先停用')
  })

  it('拒绝不受信任的二维码地址', async () => {
    verificationUrl = 'https://evil.example.com/page/launcher?user_code=ABC'
    await expect(service.start(user.id)).rejects.toThrow('不受信任')
  })
})
