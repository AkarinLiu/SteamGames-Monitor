import { toDataURL } from 'qrcode'
import { LIMITS } from '../../../shared/constants'
import type {
  DingtalkQrPollResult,
  DingtalkQrSession,
  DingtalkQrStatus,
} from '../../../shared/types'
import type { Db } from '../../db/database'
import { countBotsForUser, createBot } from '../../db/repo/bots'
import { badGateway, conflict, notFound } from '../../lib/errors'
import { generateBotSlug } from '../../lib/botSlug'
import { randomId } from '../../lib/ids'
import { logger } from '../../lib/logger'
import { botAad, currentKeyVersion, encryptConfig } from '../../notify/secrets'

const log = logger.child('dingtalk-qr')

const REGISTRATION_BASE = 'https://oapi.dingtalk.com'
const INIT_PATH = '/app/registration/init'
const BEGIN_PATH = '/app/registration/begin'
const POLL_PATH = '/app/registration/poll'
// DingTalk only preserves a whitelisted source in the registration URL and
// uses it to select the bot template; custom values are dropped.
const SOURCE = 'DING_DWS_CLAW'
const SESSION_TTL_MS = 10 * 60_000
const QR_HOSTS = new Set(['open-dev.dingtalk.com', 'open.dingtalk.com'])
const DEFAULT_BOT_NAME = '钉钉智能机器人'

interface RegistrationResponse {
  errcode?: number
  errmsg?: string
  nonce?: string
  device_code?: string
  verification_uri_complete?: string
  expires_in?: number
  interval?: number
  status?: string
  client_id?: string
  client_secret?: string
  fail_reason?: string
  [key: string]: unknown
}

interface QrSessionEntry {
  id: string
  userId: number
  name: string
  deviceCode: string
  intervalMs: number
  createdAt: number
  expiresAt: number
  lastPollAt: number
  polling: boolean
  status: DingtalkQrStatus
  message?: string
  botId?: number
  enabled?: boolean
  ownerPlatformUserId?: string
}

export interface DingtalkQrServiceOptions {
  now?: () => number
  fetch?: typeof fetch
}

function trustedQrUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (!QR_HOSTS.has(url.hostname)) return null
    if (url.port && url.port !== '443') return null
    return url.toString()
  } catch {
    return null
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export class DingtalkQrService {
  private readonly sessions = new Map<string, QrSessionEntry>()
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly db: Db,
    options: DingtalkQrServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.fetchImpl = options.fetch ?? fetch
  }

  async start(userId: number, name?: string): Promise<DingtalkQrSession> {
    const now = this.now()
    this.prune(now)
    this.assertCanAdd(userId)

    const init = await this.request(INIT_PATH, { source: SOURCE })
    if (!init.nonce) throw badGateway('钉钉授权服务未返回 nonce')

    const begin = await this.request(BEGIN_PATH, { nonce: init.nonce })
    if (!begin.device_code || !begin.verification_uri_complete) {
      throw badGateway('钉钉授权服务返回了无效数据')
    }
    const trusted = trustedQrUrl(begin.verification_uri_complete)
    if (!trusted) throw badGateway('钉钉授权服务返回了不受信任的二维码地址')
    const qrUrl = new URL(trusted)
    qrUrl.searchParams.set('source', SOURCE)

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
    const intervalMs = Math.max(3_000, Number(begin.interval ?? 3) * 1000)
    const id = randomId(18)
    const entry: QrSessionEntry = {
      id,
      userId,
      name: name?.trim() || DEFAULT_BOT_NAME,
      deviceCode: begin.device_code,
      intervalMs,
      createdAt: now,
      expiresAt: now + Math.min(expiresInMs, SESSION_TTL_MS),
      lastPollAt: 0,
      polling: false,
      status: 'pending',
    }
    this.sessions.set(id, entry)
    log.info('已创建钉钉扫码会话', { userId })
    return {
      sessionId: id,
      qrDataUrl,
      expiresAt: entry.expiresAt,
      intervalMs,
    }
  }

  async poll(userId: number, sessionId: string): Promise<DingtalkQrPollResult> {
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
        payload = await this.request(POLL_PATH, { device_code: session.deviceCode })
      } catch {
        session.message = '查询扫码状态失败，请稍后重试'
        return this.toResult(session)
      }

      const status = String(payload.status ?? '').trim().toUpperCase()
      if (status === 'WAITING') {
        session.message = '等待扫码授权'
        return this.toResult(session)
      }
      log.debug('钉钉扫码状态', { userId: session.userId, status })
      if (status === 'SUCCESS') {
        const clientId = payload.client_id?.trim()
        const clientSecret = payload.client_secret?.trim()
        if (!clientId || !clientSecret) {
          session.status = 'failed'
          session.message = '扫码成功，但钉钉未返回应用凭据'
          return this.toResult(session)
        }
        return this.complete(session, clientId, clientSecret, payload)
      }
      if (status === 'EXPIRED') {
        session.status = 'expired'
        session.message = '二维码已过期，请重新生成'
        log.info('钉钉扫码会话已过期', { userId: session.userId })
        return this.toResult(session)
      }
      if (status === 'FAIL' || status === 'FAILED') {
        session.status = 'failed'
        session.message = payload.fail_reason
          ? `钉钉授权失败：${payload.fail_reason}`
          : '钉钉授权失败，请重新扫码'
        log.warn('钉钉扫码授权失败', {
          userId: session.userId,
          reason: payload.fail_reason ?? 'unknown',
        })
        return this.toResult(session)
      }

      // DingTalk may report intermediate states (for example after scanning
      // but before confirmation). Only explicit FAIL/EXPIRED are terminal.
      session.message = status
        ? `等待扫码授权（${status}）`
        : '等待扫码授权'
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
    path: string,
    body: Record<string, unknown>,
  ): Promise<RegistrationResponse> {
    let response: Response
    try {
      response = await this.fetchImpl(`${REGISTRATION_BASE}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw badGateway('无法连接钉钉授权服务，请检查服务器网络')
    }
    const payload = (await response.json().catch(() => null)) as RegistrationResponse | null
    if (!payload || payload.errcode !== 0) {
      throw badGateway(
        `钉钉授权服务错误：${payload?.errmsg ?? `HTTP ${response.status}`}`,
      )
    }
    return payload
  }

  private assertCanAdd(userId: number): void {
    if (countBotsForUser(this.db, userId) >= LIMITS.maxBotsPerUser) {
      throw conflict(`每个账号最多创建 ${LIMITS.maxBotsPerUser} 个机器人`)
    }
    const enabled = this.db
      .prepare("SELECT id FROM bot_apps WHERE user_id = ? AND platform = 'dingtalk' AND enabled = 1")
      .get(userId)
    if (enabled) {
      throw conflict('该平台已有一个启用的机器人，请先停用后再扫码添加')
    }
  }

  private complete(
    session: QrSessionEntry,
    clientId: string,
    clientSecret: string,
    payload: RegistrationResponse,
  ): DingtalkQrPollResult {
    try {
      this.assertCanAdd(session.userId)
    } catch (error) {
      session.status = 'failed'
      session.message = error instanceof Error ? error.message : '无法创建机器人'
      return this.toResult(session)
    }

    try {
      const userInfo =
        payload.user_info && typeof payload.user_info === 'object'
          ? (payload.user_info as Record<string, unknown>)
          : undefined
      const ownerPlatformUserId = firstString(
        payload.staff_id,
        payload.user_id,
        payload.staffId,
        payload.userId,
        userInfo?.staff_id,
        userInfo?.user_id,
        userInfo?.staffId,
        userInfo?.userId,
      )
      const config: Record<string, unknown> = {
        appKey: clientId,
        appSecret: clientSecret,
        robotCode: clientId,
        connectionMode: 'stream',
      }
      if (ownerPlatformUserId) config.ownerPlatformUserId = ownerPlatformUserId

      const row = createBot(this.db, {
        userId: session.userId,
        platform: 'dingtalk',
        name: session.name,
        webhookSlug: generateBotSlug(this.db, session.name),
        enabled: true,
        configEnc: encryptConfig(config, botAad(session.userId, 'dingtalk')),
        keyVersion: currentKeyVersion(),
      })
      session.status = 'success'
      session.botId = row.id
      session.enabled = true
      session.ownerPlatformUserId = ownerPlatformUserId
      session.message = '已添加并启用，正在建立 Stream 长连接'
      log.info('扫码创建钉钉机器人成功', { userId: session.userId, botId: row.id })
      return this.toResult(session)
    } catch (error) {
      session.status = 'failed'
      session.message = '创建机器人失败，请重新扫码或手动填写 Client ID / Client Secret'
      log.error('扫码创建钉钉机器人失败', { userId: session.userId, error })
      return this.toResult(session)
    }
  }

  private toResult(session: QrSessionEntry): DingtalkQrPollResult {
    return {
      status: session.status,
      botId: session.botId,
      enabled: session.enabled,
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
