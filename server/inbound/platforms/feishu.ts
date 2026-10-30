import { createHash } from 'node:crypto'
import { safeJsonParse } from '../../../shared/utils'
import type { BotAppRow } from '../../db/rows'
import type { FeishuBotConfig, PlatformHandleResult } from '../types'
import { decryptAesCbc, safeEqual, sha256Hex } from '../crypto/common'

const SIGNATURE_WINDOW_SECONDS = 300

interface FeishuEnvelope {
  encrypt?: string
  type?: string
  challenge?: string
  token?: string
  schema?: string
  header?: {
    event_id?: string
    event_type?: string
    token?: string
  }
  event?: {
    sender?: {
      sender_id?: { open_id?: string; user_id?: string; union_id?: string }
      sender_type?: string
    }
    message?: {
      message_id?: string
      chat_id?: string
      chat_type?: string
      message_type?: string
      content?: string
      mentions?: Array<{ key?: string; name?: string }>
    }
  }
}

function decryptFeishuPayload(rawBody: string, encryptKey: string): string {
  const envelope = safeJsonParse<FeishuEnvelope | null>(rawBody, null)
  if (!envelope?.encrypt) return rawBody
  const key = createHash('sha256').update(encryptKey, 'utf8').digest()
  const ciphertext = Buffer.from(envelope.encrypt, 'base64')
  if (ciphertext.length <= 16) throw new Error('飞书密文长度异常')
  const iv = ciphertext.subarray(0, 16)
  const data = ciphertext.subarray(16)
  const plain = decryptAesCbc(data, key, iv, null)
  return plain.toString('utf8')
}

function verifySignature(
  headers: Record<string, string>,
  rawBody: string,
  encryptKey: string,
): boolean {
  const timestamp = headers['x-lark-request-timestamp']
  const nonce = headers['x-lark-request-nonce']
  const signature = headers['x-lark-signature']
  if (!timestamp || !nonce || !signature) return false
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds)) return false
  if (Math.abs(Date.now() / 1000 - seconds) > SIGNATURE_WINDOW_SECONDS) return false
  const expected = sha256Hex(`${timestamp}${nonce}${encryptKey}${rawBody}`)
  return safeEqual(expected, signature)
}

function stripMentions(text: string, mentions: Array<{ key?: string; name?: string }> = []): string {
  let cleaned = text
  for (const mention of mentions) {
    if (mention.key) cleaned = cleaned.split(mention.key).join(' ')
  }
  cleaned = cleaned.replace(/@_user_\d+/g, ' ')
  return cleaned.replace(/\s+/g, ' ').trim()
}

export function handleFeishuUpdate(input: {
  bot: BotAppRow
  config: FeishuBotConfig
  headers: Record<string, string>
  rawBody: string
  now?: number
}): PlatformHandleResult {
  const { bot, config, headers, rawBody } = input
  const now = input.now ?? Date.now()

  let body = rawBody
  if (config.encryptKey) {
    if (!verifySignature(headers, rawBody, config.encryptKey)) {
      return { kind: 'error', status: 401, message: '飞书签名校验失败' }
    }
    try {
      body = decryptFeishuPayload(rawBody, config.encryptKey)
    } catch {
      return { kind: 'error', status: 400, message: '飞书密文解密失败' }
    }
  }

  const payload = safeJsonParse<FeishuEnvelope | null>(body, null)
  if (!payload) return { kind: 'error', status: 400, message: '飞书回调不是合法 JSON' }

  if (payload.type === 'url_verification') {
    if (config.verificationToken && payload.token !== config.verificationToken) {
      return { kind: 'error', status: 401, message: '飞书 verification token 不匹配' }
    }
    return { kind: 'challenge', body: { challenge: payload.challenge ?? '' } }
  }

  if (config.verificationToken) {
    const token = payload.header?.token ?? payload.token
    if (token !== config.verificationToken) {
      return { kind: 'error', status: 401, message: '飞书 verification token 不匹配' }
    }
  }

  if (payload.header?.event_type !== 'im.message.receive_v1') {
    return { kind: 'ignored', body: { ok: true } }
  }
  const message = payload.event?.message
  const sender = payload.event?.sender
  if (!message || sender?.sender_type === 'app') {
    return { kind: 'ignored', body: { ok: true } }
  }
  if (message.message_type !== 'text') {
    return { kind: 'ignored', body: { ok: true } }
  }
  const content = message.content
    ? safeJsonParse<{ text?: string } | null>(message.content, null)
    : null
  const text = stripMentions(content?.text ?? '', message.mentions)
  const platformUserId =
    sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? sender?.sender_id?.union_id
  if (!text || !platformUserId || !message.message_id) {
    return { kind: 'ignored', body: { ok: true } }
  }

  return {
    kind: 'event',
    event: {
      platform: 'feishu',
      botApp: bot,
      ownerUserId: bot.user_id,
      platformMessageId: payload.header?.event_id ?? message.message_id,
      chatId: message.chat_id ?? '',
      chatType: message.chat_type === 'group' ? 'group' : message.chat_type === 'p2p' ? 'single' : undefined,
      platformUserId,
      userName: null,
      text,
      reply: {
        type: 'feishu',
        messageId: message.message_id,
        chatId: message.chat_id ?? '',
      },
      receivedAt: now,
    },
  }
}
