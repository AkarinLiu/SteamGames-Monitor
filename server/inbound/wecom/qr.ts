import { toDataURL } from 'qrcode'
import { LIMITS } from '../../../shared/constants'
import type {
  WecomQrPollResult,
  WecomQrSession,
  WecomQrStatus,
} from '../../../shared/types'
import type { Db } from '../../db/database'
import { countBotsForUser, createBot } from '../../db/repo/bots'
import { AppError, badGateway, conflict, notFound } from '../../lib/errors'
import { generateBotSlug } from '../../lib/botSlug'
import { randomId } from '../../lib/ids'
import { logger } from '../../lib/logger'
import { botAad, currentKeyVersion, encryptConfig } from '../../notify/secrets'

const log = logger.child('wecom-qr')

// WeCom smart-bot QR authorization flow, matching WecomTeam/wecom-cli.
const QR_GENERATE_URL = 'https://work.weixin.qq.com/ai/qc/generate'
const QR_QUERY_URL = 'https://work.weixin.qq.com/ai/qc/query_result'
const SOURCE = 'steamgames_monitor'
const SESSION_TTL_MS = 5 * 60_000
const MIN_POLL_MS = 1_500
const DEFAULT_BOT_NAME = '企业微信智能机器人'

interface WecomQrPayload {
  data?: {
    scode?: string
    auth_url?: string
    status?: string
    bot_info?: {
      botid?: string
      secret?: string
    }
  }
}

interface QrSessionEntry {
  id: string
  userId: number
  name: string
  scode: string
  createdAt: number
  expiresAt: number
  lastPollAt: number
  polling: boolean
  status: WecomQrStatus
  message?: string
  botId?: number
  enabled?: boolean
}

export interface WecomQrServiceOptions {
  now?: () => number
  fetch?: typeof fetch
}

function platformCode(): number {
  if (process.platform === 'darwin') return 1
  if (process.platform === 'win32') return 2
  if (process.platform === 'linux') return 3
  return 0
}

function trustedAuthUrl(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'work.weixin.qq.com') return null
    if (url.port && url.port !== '443') return null
    return url.toString()
  } catch {
    return null
  }
}

export class WecomQrService {
  private readonly sessions = new Map<string, QrSessionEntry>()
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly db: Db,
    options: WecomQrServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.fetchImpl = options.fetch ?? fetch
  }

  async start(userId: number, name?: string): Promise<WecomQrSession> {
    const now = this.now()
    this.prune(now)
    this.assertCanAdd(userId)

    const url = new URL(QR_GENERATE_URL)
    url.searchParams.set('source', SOURCE)
    url.searchParams.set('plat', String(platformCode()))

    let payload: WecomQrPayload | null
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        throw badGateway(`企业微信二维码服务返回 HTTP ${response.status}`)
      }
      payload = (await response.json().catch(() => null)) as WecomQrPayload | null
    } catch (error) {
      if (error instanceof AppError) throw error
      throw badGateway('无法获取企业微信二维码，请检查服务器网络')
    }

    const scode = payload?.data?.scode
    const authUrl = trustedAuthUrl(payload?.data?.auth_url)
    if (!scode || !authUrl) {
      throw badGateway('企业微信二维码服务返回了无效数据')
    }

    let qrDataUrl: string
    try {
      qrDataUrl = await toDataURL(authUrl, {
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

    const id = randomId(18)
    const entry: QrSessionEntry = {
      id,
      userId,
      name: name?.trim() || DEFAULT_BOT_NAME,
      scode,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastPollAt: 0,
      polling: false,
      status: 'pending',
    }
    this.sessions.set(id, entry)
    log.info('已创建扫码会话', { userId })
    return { sessionId: id, qrDataUrl, expiresAt: entry.expiresAt }
  }

  async poll(userId: number, sessionId: string): Promise<WecomQrPollResult> {
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
    if (now - session.lastPollAt < MIN_POLL_MS) return this.toResult(session)
    if (session.polling) return this.toResult(session)
    session.lastPollAt = now
    session.polling = true

    try {
      const url = new URL(QR_QUERY_URL)
      url.searchParams.set('scode', session.scode)
      let payload: WecomQrPayload | null
      try {
        const response = await this.fetchImpl(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
          session.message = `查询扫码状态失败（HTTP ${response.status}）`
          return this.toResult(session)
        }
        payload = (await response.json().catch(() => null)) as WecomQrPayload | null
      } catch {
        session.message = '查询扫码状态失败，请稍后重试'
        return this.toResult(session)
      }

      const status = payload?.data?.status?.toLowerCase()
      if (status === 'success') {
        const botId = payload?.data?.bot_info?.botid
        const secret = payload?.data?.bot_info?.secret
        if (!botId || !secret) {
          session.status = 'failed'
          session.message = '扫码成功，但企业微信未返回机器人凭据'
          return this.toResult(session)
        }
        return this.complete(session, botId, secret)
      }
      if (status === 'expired' || status === 'timeout') {
        session.status = 'expired'
        session.message = '二维码已过期，请重新生成'
        return this.toResult(session)
      }
      if (status === 'fail' || status === 'failed' || status === 'error') {
        session.status = 'failed'
        session.message = '企业微信授权失败，请重新扫码'
        return this.toResult(session)
      }
      session.message = '等待扫码授权'
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

  private assertCanAdd(userId: number): void {
    if (countBotsForUser(this.db, userId) >= LIMITS.maxBotsPerUser) {
      throw conflict(`每个账号最多创建 ${LIMITS.maxBotsPerUser} 个机器人`)
    }
    const enabled = this.db
      .prepare("SELECT id FROM bot_apps WHERE user_id = ? AND platform = 'wecom' AND enabled = 1")
      .get(userId)
    if (enabled) {
      throw conflict('该平台已有一个启用的机器人，请先停用后再扫码添加')
    }
  }

  private complete(session: QrSessionEntry, botId: string, secret: string): WecomQrPollResult {
    try {
      this.assertCanAdd(session.userId)
    } catch (error) {
      session.status = 'failed'
      session.message = error instanceof Error ? error.message : '无法创建机器人'
      return this.toResult(session)
    }

    try {
      const row = createBot(this.db, {
        userId: session.userId,
        platform: 'wecom',
        name: session.name,
        webhookSlug: generateBotSlug(this.db, session.name),
        enabled: true,
        configEnc: encryptConfig(
          { botId, secret },
          botAad(session.userId, 'wecom'),
        ),
        keyVersion: currentKeyVersion(),
      })
      session.status = 'success'
      session.botId = row.id
      session.enabled = true
      session.message = '已添加并启用，正在建立长连接'
      session.scode = ''
      log.info('扫码创建机器人成功', { userId: session.userId, botId: row.id })
      return this.toResult(session)
    } catch (error) {
      session.status = 'failed'
      session.message = '创建机器人失败，请重新扫码，或重新获取 Bot ID / Secret 后手动填写'
      log.error('扫码创建机器人失败', { userId: session.userId, error })
      return this.toResult(session)
    }
  }

  private toResult(session: QrSessionEntry): WecomQrPollResult {
    return {
      status: session.status,
      botId: session.botId,
      enabled: session.enabled,
      message: session.message,
    }
  }

  private prune(now: number): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt + 60_000 <= now) this.sessions.delete(id)
    }
  }
}
