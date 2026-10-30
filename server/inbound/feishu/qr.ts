import { toDataURL } from 'qrcode'
import { LIMITS } from '../../../shared/constants'
import type {
  FeishuBrand,
  FeishuQrPollResult,
  FeishuQrSession,
  FeishuQrStatus,
} from '../../../shared/types'
import type { Db } from '../../db/database'
import { countBotsForUser, createBot } from '../../db/repo/bots'
import { badGateway, conflict, notFound } from '../../lib/errors'
import { generateBotSlug } from '../../lib/botSlug'
import { randomId } from '../../lib/ids'
import { logger } from '../../lib/logger'
import { botAad, currentKeyVersion, encryptConfig } from '../../notify/secrets'
import { FEISHU_ACCOUNTS_BASE } from './domains'

const log = logger.child('feishu-qr')

const REGISTRATION_PATH = '/oauth/v1/app/registration'
const QR_HOSTS: Record<FeishuBrand, string> = {
  feishu: 'open.feishu.cn',
  lark: 'open.larksuite.com',
}
const SESSION_TTL_MS = 10 * 60_000
const SOURCE = 'node-sdk/steamgames-monitor'
const DEFAULT_BOT_NAME: Record<FeishuBrand, string> = {
  feishu: '飞书智能机器人',
  lark: 'Lark 智能机器人',
}

interface RegistrationResponse {
  supported_auth_methods?: string[]
  device_code?: string
  verification_uri_complete?: string
  expires_in?: number
  interval?: number
  client_id?: string
  client_secret?: string
  user_info?: {
    open_id?: string
    tenant_brand?: string
  }
  error?: string
  error_description?: string
}

interface QrSessionEntry {
  id: string
  userId: number
  name: string
  brand: FeishuBrand
  deviceCode: string
  baseUrl: string
  intervalMs: number
  createdAt: number
  expiresAt: number
  lastPollAt: number
  polling: boolean
  status: FeishuQrStatus
  message?: string
  botId?: number
  enabled?: boolean
  ownerPlatformUserId?: string
}

export interface FeishuQrServiceOptions {
  now?: () => number
  fetch?: typeof fetch
}

function trustedQrUrl(raw: string, brand: FeishuBrand): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== QR_HOSTS[brand]) return null
    if (url.port && url.port !== '443') return null
    return url.toString()
  } catch {
    return null
  }
}

function brandFromTenant(value: string | undefined): FeishuBrand | null {
  if (value === 'feishu' || value === 'lark') return value
  return null
}

export class FeishuQrService {
  private readonly sessions = new Map<string, QrSessionEntry>()
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly db: Db,
    options: FeishuQrServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.fetchImpl = options.fetch ?? fetch
  }

  async start(
    userId: number,
    name?: string,
    brand: FeishuBrand = 'feishu',
  ): Promise<FeishuQrSession> {
    const now = this.now()
    this.prune(now)
    this.assertCanAdd(userId)

    const baseUrl = FEISHU_ACCOUNTS_BASE[brand]
    const init = await this.request(baseUrl, { action: 'init' })
    if (!init.supported_auth_methods?.includes('client_secret')) {
      throw badGateway('飞书授权服务不支持应用创建，请稍后重试')
    }

    const begin = await this.request(baseUrl, {
      action: 'begin',
      archetype: 'PersonalAgent',
      auth_method: 'client_secret',
      request_user_info: 'open_id',
    })
    if (!begin.device_code || !begin.verification_uri_complete) {
      throw badGateway('飞书授权服务返回了无效数据')
    }

    const trusted = trustedQrUrl(begin.verification_uri_complete, brand)
    if (!trusted) throw badGateway('飞书授权服务返回了不受信任的二维码地址')
    const qrUrl = new URL(trusted)
    qrUrl.searchParams.set('from', 'sdk')
    qrUrl.searchParams.set('tp', 'sdk')
    qrUrl.searchParams.set('source', SOURCE)
    qrUrl.searchParams.set('createOnly', 'true')
    qrUrl.searchParams.set('name', name?.trim() || DEFAULT_BOT_NAME[brand])

    let qrDataUrl: string
    try {
      qrDataUrl = await toDataURL(qrUrl.toString(), {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: { dark: '#111827', light: '#ffffff' },
      })
    } catch {
      throw badGateway('生成二维码图片失败，请稍后重试')
    }

    for (const [id, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(id)
    }

    const expiresInMs = Math.max(60, Number(begin.expires_in ?? 600)) * 1000
    const intervalSeconds = Math.min(30, Math.max(3, Number(begin.interval ?? 5)))
    const id = randomId(18)
    const entry: QrSessionEntry = {
      id,
      userId,
      name: name?.trim() || DEFAULT_BOT_NAME[brand],
      brand,
      deviceCode: begin.device_code,
      baseUrl,
      intervalMs: intervalSeconds * 1000,
      createdAt: now,
      expiresAt: now + Math.min(expiresInMs, SESSION_TTL_MS),
      lastPollAt: 0,
      polling: false,
      status: 'pending',
    }
    this.sessions.set(id, entry)
    log.info('已创建飞书扫码会话', { userId, brand })
    return {
      sessionId: id,
      qrDataUrl,
      expiresAt: entry.expiresAt,
      brand,
      intervalMs: entry.intervalMs,
    }
  }

  async poll(userId: number, sessionId: string): Promise<FeishuQrPollResult> {
    const now = this.now()
    this.prune(now)
    const session = this.sessions.get(sessionId)
    if (!session || session.userId !== userId) {
      throw notFound('扫码会话不存在或已过期')
    }
    if (session.status !== 'pending') return this.toResult(session)
    if (now >= session.expiresAt) {
      session.status = 'expired'
      session.message = '二维码已过期，请重新生成'
      return this.toResult(session)
    }
    if (now - session.lastPollAt < session.intervalMs) return this.toResult(session)
    if (session.polling) return this.toResult(session)
    session.lastPollAt = now
    session.polling = true

    try {
      let payload: RegistrationResponse
      try {
        payload = await this.request(session.baseUrl, {
          action: 'poll',
          device_code: session.deviceCode,
        })
      } catch {
        session.message = '查询扫码状态失败，请稍后重试'
        return this.toResult(session)
      }

      if (payload.client_id && payload.client_secret) {
        const brand = brandFromTenant(payload.user_info?.tenant_brand) ?? session.brand
        return this.complete(
          session,
          payload.client_id,
          payload.client_secret,
          brand,
          payload.user_info?.open_id,
        )
      }

      if (brandFromTenant(payload.user_info?.tenant_brand) === 'lark' && session.brand !== 'lark') {
        session.brand = 'lark'
        session.baseUrl = FEISHU_ACCOUNTS_BASE.lark
        session.message = '检测到 Lark 租户，已切换授权域，等待扫码确认'
        return this.toResult(session)
      }

      const error = payload.error ?? ''
      if (error === 'authorization_pending') {
        session.message = '等待扫码授权'
        return this.toResult(session)
      }
      if (error === 'slow_down') {
        session.intervalMs = Math.min(30_000, session.intervalMs + 5_000)
        session.message = '等待扫码授权（已降低查询频率）'
        return this.toResult(session)
      }
      if (error === 'access_denied') {
        session.status = 'failed'
        session.message = '你已拒绝授权，请重新扫码'
        return this.toResult(session)
      }
      if (error === 'expired_token') {
        session.status = 'expired'
        session.message = '二维码已过期，请重新生成'
        return this.toResult(session)
      }

      session.status = 'failed'
      session.message = payload.error_description
        ? `飞书授权失败：${payload.error_description}`
        : '飞书授权失败，请重新扫码'
      return this.toResult(session)
    } finally {
      session.polling = false
    }
  }

  cancel(userId: number, sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.userId !== userId) {
      throw notFound('扫码会话不存在或已过期')
    }
    this.sessions.delete(sessionId)
  }

  stop(): void {
    this.sessions.clear()
  }

  private async request(
    baseUrl: string,
    params: Record<string, string>,
  ): Promise<RegistrationResponse> {
    let response: Response
    try {
      response = await this.fetchImpl(`${baseUrl}${REGISTRATION_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw badGateway('无法连接飞书授权服务，请检查服务器网络')
    }
    const payload = (await response.json().catch(() => null)) as RegistrationResponse | null
    if (!payload) {
      throw badGateway(`飞书授权服务返回无效响应（HTTP ${response.status}）`)
    }
    return payload
  }

  private assertCanAdd(userId: number): void {
    if (countBotsForUser(this.db, userId) >= LIMITS.maxBotsPerUser) {
      throw conflict(`每个账号最多创建 ${LIMITS.maxBotsPerUser} 个机器人`)
    }
    const enabled = this.db
      .prepare("SELECT id FROM bot_apps WHERE user_id = ? AND platform = 'feishu' AND enabled = 1")
      .get(userId)
    if (enabled) {
      throw conflict('该平台已有一个启用的机器人，请先停用后再扫码添加')
    }
  }

  private complete(
    session: QrSessionEntry,
    appId: string,
    appSecret: string,
    brand: FeishuBrand,
    openId: string | undefined,
  ): FeishuQrPollResult {
    try {
      this.assertCanAdd(session.userId)
    } catch (error) {
      session.status = 'failed'
      session.message = error instanceof Error ? error.message : '无法创建机器人'
      return this.toResult(session)
    }

    try {
      const ownerPlatformUserId = openId?.trim() || undefined
      const config: Record<string, unknown> = {
        appId,
        appSecret,
        brand,
        connectionMode: 'websocket',
      }
      if (ownerPlatformUserId) config.ownerPlatformUserId = ownerPlatformUserId

      const row = createBot(this.db, {
        userId: session.userId,
        platform: 'feishu',
        name: session.name,
        webhookSlug: generateBotSlug(this.db, session.name),
        enabled: true,
        configEnc: encryptConfig(config, botAad(session.userId, 'feishu')),
        keyVersion: currentKeyVersion(),
      })
      session.status = 'success'
      session.botId = row.id
      session.enabled = true
      session.brand = brand
      session.ownerPlatformUserId = ownerPlatformUserId
      session.message = '已添加并启用，正在建立长连接'
      log.info('扫码创建飞书机器人成功', {
        userId: session.userId,
        botId: row.id,
        brand,
      })
      return this.toResult(session)
    } catch (error) {
      session.status = 'failed'
      session.message = '创建机器人失败，请重新扫码或手动填写 App ID / App Secret'
      log.error('扫码创建飞书机器人失败', { userId: session.userId, error })
      return this.toResult(session)
    }
  }

  private toResult(session: QrSessionEntry): FeishuQrPollResult {
    return {
      status: session.status,
      botId: session.botId,
      enabled: session.enabled,
      brand: session.brand,
      ownerPlatformUserId: session.ownerPlatformUserId,
      message: session.message,
    }
  }

  private prune(now: number): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt + 60_000 <= now) this.sessions.delete(id)
    }
  }
}
