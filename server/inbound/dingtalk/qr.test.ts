import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../db/database'
import type { UserRow } from '../../db/rows'
import type { DingtalkBotConfig } from '../types'
import type { DingtalkQrService as DingtalkQrServiceType } from './qr'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('DingtalkQrService', () => {
  let db: Db
  let user: UserRow
  let service: DingtalkQrServiceType
  let now: number
  let pollPayload: Record<string, unknown>
  let verificationUrl: string
  let fetchMock: ReturnType<typeof vi.fn>
  let requests: Array<{ url: string; body: string }>

  beforeEach(async () => {
    const { openDatabase } = await import('../../db/database')
    const { createUser } = await import('../../db/repo/users')
    const { DingtalkQrService } = await import('./qr')

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
    pollPayload = { status: 'WAITING' }
    verificationUrl =
      'https://open-dev.dingtalk.com/openapp/registration/openClaw?user_code=ABCD-EFGH'
    requests = []
    fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(
      async (input, init) => {
        const url = String(input)
        const body = String(init?.body ?? '')
        requests.push({ url, body })
        if (url.endsWith('/app/registration/init')) {
          return jsonResponse({ errcode: 0, errmsg: 'ok', nonce: 'nonce-1', expires_in: 300 })
        }
        if (url.endsWith('/app/registration/begin')) {
          return jsonResponse({
            errcode: 0,
            errmsg: 'ok',
            device_code: 'device-1',
            verification_uri_complete: verificationUrl,
            expires_in: 7200,
            interval: 2,
          })
        }
        if (url.endsWith('/app/registration/poll')) {
          return jsonResponse({ errcode: 0, errmsg: 'ok', ...pollPayload })
        }
        throw new Error(`unexpected registration request: ${url}`)
      },
    )
    service = new DingtalkQrService(db, {
      now: () => now,
      fetch: fetchMock as unknown as typeof fetch,
    })
  })

  afterEach(() => {
    service.stop()
    db.close()
  })

  it('生成钉钉二维码并在扫码成功后创建 Stream 机器人', async () => {
    const session = await service.start(user.id, '钉钉监控机器人')
    expect(session.sessionId).toBeTruthy()
    expect(session.intervalMs).toBe(3_000)
    expect(session.expiresAt).toBe(now + 10 * 60_000)
    expect(session.qrDataUrl).toMatch(/^data:image\/png;base64,/)

    const init = requests.find((item) => item.url.endsWith('/init'))
    expect(JSON.parse(init!.body)).toMatchObject({ source: expect.any(String) })
    const begin = requests.find((item) => item.url.endsWith('/begin'))
    expect(JSON.parse(begin!.body)).toEqual({ nonce: 'nonce-1' })

    now += 3_000
    const pending = await service.poll(user.id, session.sessionId)
    expect(pending.status).toBe('pending')

    pollPayload = {
      status: 'SUCCESS',
      client_id: 'ding_client_1',
      client_secret: 'ding_secret_1',
      staff_id: 'staff-owner',
    }
    now += 3_000
    const success = await service.poll(user.id, session.sessionId)
    expect(success).toMatchObject({
      status: 'success',
      enabled: true,
      ownerPlatformUserId: 'staff-owner',
    })

    const { findBotByIdInternal } = await import('../../db/repo/bots')
    const row = findBotByIdInternal(db, success.botId!)
    expect(row?.platform).toBe('dingtalk')
    expect(row?.enabled).toBe(1)
    expect(row?.name).toBe('钉钉监控机器人')

    const { decryptConfig, botAad } = await import('../../notify/secrets')
    const config = decryptConfig<DingtalkBotConfig>(
      row!.config_enc,
      botAad(user.id, 'dingtalk'),
    )
    expect(config).toEqual({
      appKey: 'ding_client_1',
      appSecret: 'ding_secret_1',
      robotCode: 'ding_client_1',
      connectionMode: 'stream',
      ownerPlatformUserId: 'staff-owner',
    })
  })

  it('二维码过期后返回 expired，且不再请求钉钉授权服务', async () => {
    const session = await service.start(user.id)
    now += 10 * 60_000 + 1
    const callsBefore = fetchMock.mock.calls.length
    const result = await service.poll(user.id, session.sessionId)
    expect(result.status).toBe('expired')
    expect(fetchMock.mock.calls.length).toBe(callsBefore)
  })

  it('用户拒绝或授权失败时返回 failed', async () => {
    const session = await service.start(user.id)
    pollPayload = { status: 'FAIL', fail_reason: 'user rejected' }
    now += 3_000
    const result = await service.poll(user.id, session.sessionId)
    expect(result.status).toBe('failed')
    expect(result.message).toContain('user rejected')
  })

  it('遇到未知的中间状态时继续等待而不是立即失败', async () => {
    const session = await service.start(user.id)
    pollPayload = { status: 'SCANNED' }
    now += 3_000
    const result = await service.poll(user.id, session.sessionId)
    expect(result.status).toBe('pending')
    expect(result.message).toContain('SCANNED')
  })

  it('钉钉返回 EXPIRED 时标记二维码过期', async () => {
    const session = await service.start(user.id)
    pollPayload = { status: 'EXPIRED' }
    now += 3_000
    const result = await service.poll(user.id, session.sessionId)
    expect(result.status).toBe('expired')
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

  it('已有启用中的钉钉机器人时拒绝再次扫码', async () => {
    const { createBot } = await import('../../db/repo/bots')
    const { encryptConfig, botAad } = await import('../../notify/secrets')
    createBot(db, {
      userId: user.id,
      platform: 'dingtalk',
      name: '已有机器人',
      webhookSlug: 'existing-dingtalk',
      enabled: true,
      configEnc: encryptConfig(
        { appKey: 'ding-existing', appSecret: 'secret-existing' },
        botAad(user.id, 'dingtalk'),
      ),
      keyVersion: 1,
    })
    await expect(service.start(user.id)).rejects.toThrow('请先停用')
  })

  it('拒绝不受信任的二维码地址', async () => {
    verificationUrl = 'https://evil.example.com/registration?user_code=ABC'
    await expect(service.start(user.id)).rejects.toThrow('不受信任')
  })
})
