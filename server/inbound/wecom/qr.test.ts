import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../db/database'
import type { UserRow } from '../../db/rows'
import type { WecomBotConfig } from '../types'
import type { WecomQrService as WecomQrServiceType } from './qr'

process.env.NODE_ENV = 'test'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.PUBLIC_BASE_URL = 'http://localhost:8787'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('WecomQrService', () => {
  let db: Db
  let user: UserRow
  let service: WecomQrServiceType
  let now: number
  let queryStatus: string
  let generateAuthUrl: string
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { openDatabase } = await import('../../db/database')
    const { createUser } = await import('../../db/repo/users')
    const { WecomQrService } = await import('./qr')

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
    queryStatus = 'init'
    generateAuthUrl = 'https://work.weixin.qq.com/ai/qc/c?s=scode-1&for_native=true'
    fetchMock = vi.fn<(input: unknown) => Promise<Response>>(async (input) => {
      const url = String(input)
      if (url.includes('/ai/qc/generate')) {
        return jsonResponse({
          data: { scode: 'scode-1', auth_url: generateAuthUrl },
        })
      }
      if (url.includes('/ai/qc/query_result')) {
        if (queryStatus === 'success') {
          return jsonResponse({
            data: { status: 'success', bot_info: { botid: 'bot-1', secret: 'secret-1' } },
          })
        }
        return jsonResponse({ data: { status: queryStatus } })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    service = new WecomQrService(db, {
      now: () => now,
      fetch: fetchMock as unknown as typeof fetch,
    })
  })

  afterEach(() => {
    service.stop()
    db.close()
  })

  it('生成二维码并在扫码成功后创建机器人', async () => {
    const session = await service.start(user.id)
    expect(session.sessionId).toBeTruthy()
    expect(session.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(session.expiresAt).toBe(now + 5 * 60_000)

    now += 2_000
    const pending = await service.poll(user.id, session.sessionId)
    expect(pending.status).toBe('pending')

    queryStatus = 'success'
    now += 2_000
    const success = await service.poll(user.id, session.sessionId)
    expect(success).toMatchObject({ status: 'success', enabled: true })

    const { findBotByIdInternal } = await import('../../db/repo/bots')
    const row = findBotByIdInternal(db, success.botId!)
    expect(row?.platform).toBe('wecom')
    expect(row?.enabled).toBe(1)

    const { decryptConfig, botAad } = await import('../../notify/secrets')
    const config = decryptConfig<WecomBotConfig>(
      row!.config_enc,
      botAad(user.id, 'wecom'),
    )
    expect(config).toEqual({ botId: 'bot-1', secret: 'secret-1' })
  })

  it('二维码过期后返回 expired，且不再请求企业微信', async () => {
    const session = await service.start(user.id)
    now += 5 * 60_000 + 1
    const callsBefore = fetchMock.mock.calls.length
    const result = await service.poll(user.id, session.sessionId)
    expect(result.status).toBe('expired')
    expect(fetchMock.mock.calls.length).toBe(callsBefore)
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

  it('已有启用中的企业微信机器人时拒绝再次扫码', async () => {
    const { createBot } = await import('../../db/repo/bots')
    const { encryptConfig, botAad } = await import('../../notify/secrets')
    createBot(db, {
      userId: user.id,
      platform: 'wecom',
      name: '已有机器人',
      webhookSlug: 'existing-wecom',
      enabled: true,
      configEnc: encryptConfig(
        { botId: 'bot-existing', secret: 'secret-existing' },
        botAad(user.id, 'wecom'),
      ),
      keyVersion: 1,
    })
    await expect(service.start(user.id)).rejects.toThrow('请先停用')
  })

  it('拒绝非企业微信域名的二维码地址', async () => {
    generateAuthUrl = 'https://evil.example.com/qr'
    await expect(service.start(user.id)).rejects.toThrow('无效数据')
  })
})
