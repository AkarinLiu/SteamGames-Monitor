import { safeJsonParse } from '../../../shared/utils'
import type { BotAppRow } from '../../db/rows'
import type { DingtalkBotConfig, PlatformHandleResult } from '../types'
import { hmacSha256Base64, safeEqual } from '../crypto/common'

const SIGNATURE_WINDOW_MS = 60 * 60 * 1000

interface DingtalkEnvelope {
  msgId?: string
  msgtype?: string
  text?: { content?: string }
  senderId?: string
  senderStaffId?: string
  senderNick?: string
  conversationId?: string
  conversationType?: string
  sessionWebhook?: string
  sessionWebhookExpiredTime?: number
  robotCode?: string
}

export function verifyDingtalkSignature(input: {
  appSecret: string
  timestamp: string | undefined
  sign: string | undefined
  now?: number
}): boolean {
  if (!input.timestamp || !input.sign) return false
  const timestamp = Number(input.timestamp)
  if (!Number.isFinite(timestamp)) return false
  const now = input.now ?? Date.now()
  if (Math.abs(now - timestamp) > SIGNATURE_WINDOW_MS) return false
  let sign = input.sign
  try {
    sign = decodeURIComponent(sign)
  } catch {
    // header may already be decoded
  }
  const expected = hmacSha256Base64(input.appSecret, `${input.timestamp}\n${input.appSecret}`)
  return safeEqual(expected, sign)
}

export function handleDingtalkUpdate(input: {
  bot: BotAppRow
  config: DingtalkBotConfig
  headers: Record<string, string>
  rawBody: string
  now?: number
}): PlatformHandleResult {
  const { bot, config, headers, rawBody } = input
  const now = input.now ?? Date.now()

  if (!config.appSecret) {
    return { kind: 'error', status: 400, message: '钉钉机器人尚未配置 AppSecret' }
  }
  if (
    !verifyDingtalkSignature({
      appSecret: config.appSecret,
      timestamp: headers.timestamp,
      sign: headers.sign,
      now,
    })
  ) {
    return { kind: 'error', status: 401, message: '钉钉签名校验失败' }
  }

  const payload = safeJsonParse<DingtalkEnvelope | null>(rawBody, null)
  if (!payload) return { kind: 'error', status: 400, message: '钉钉回调不是合法 JSON' }
  if (payload.msgtype !== 'text') return { kind: 'ignored', body: {} }

  const text = (payload.text?.content ?? '').trim()
  const platformUserId = payload.senderStaffId ?? payload.senderId
  if (!payload.msgId || !text || !platformUserId) return { kind: 'ignored', body: {} }

  const conversationType = String(payload.conversationType ?? '')
  return {
    kind: 'event',
    event: {
      platform: 'dingtalk',
      botApp: bot,
      ownerUserId: bot.user_id,
      platformMessageId: payload.msgId,
      chatId: payload.conversationId ?? platformUserId,
      chatType:
        conversationType === '1'
          ? 'single'
          : conversationType === '2'
            ? 'group'
            : undefined,
      platformUserId,
      userName: payload.senderNick ?? null,
      text,
      reply: {
        type: 'dingtalk',
        sessionWebhook: payload.sessionWebhook ?? '',
        expiresAt: Number(payload.sessionWebhookExpiredTime ?? 0),
        userId: platformUserId,
        robotCode: payload.robotCode ?? config.robotCode ?? null,
      },
      receivedAt: now,
    },
  }
}
