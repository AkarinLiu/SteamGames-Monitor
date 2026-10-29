import type { BotAppRow } from '../../db/rows'
import type { PlatformHandleResult, WecomBotConfig } from '../types'
import { decryptAesCbc, safeEqual, sha1Hex } from '../crypto/common'

function xmlField(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`)
  const match = pattern.exec(xml)
  if (!match) return null
  const value = match[1] ?? match[2] ?? ''
  return value.trim()
}

export function wecomSignature(token: string, timestamp: string, nonce: string, encrypt: string): string {
  return sha1Hex([token, timestamp, nonce, encrypt].sort())
}

function decodeAesKey(encodingAesKey: string): Buffer {
  if (encodingAesKey.length !== 43) throw new Error('EncodingAESKey 长度必须为 43')
  return Buffer.from(`${encodingAesKey}=`, 'base64')
}

export function decryptWecomMessage(input: {
  encodingAesKey: string
  encrypted: string
  corpId?: string
}): string {
  const key = decodeAesKey(input.encodingAesKey)
  const iv = key.subarray(0, 16)
  const plain = decryptAesCbc(Buffer.from(input.encrypted, 'base64'), key, iv, 32)
  if (plain.length < 20) throw new Error('企业微信明文长度异常')
  const messageLength = plain.readUInt32BE(16)
  if (messageLength < 0 || 20 + messageLength > plain.length) {
    throw new Error('企业微信消息长度异常')
  }
  const message = plain.subarray(20, 20 + messageLength).toString('utf8')
  const receiveId = plain.subarray(20 + messageLength).toString('utf8')
  if (input.corpId && receiveId && receiveId !== input.corpId) {
    throw new Error('企业微信 receiveId 与 corpId 不一致')
  }
  return message
}

export function verifyWecomUrl(input: {
  config: WecomBotConfig
  msgSignature: string | undefined
  timestamp: string | undefined
  nonce: string | undefined
  echostr: string | undefined
}): PlatformHandleResult {
  const { config } = input
  if (!config.token || !config.encodingAesKey) {
    return { kind: 'error', status: 400, message: '企业微信尚未配置 Token / EncodingAESKey' }
  }
  if (!input.msgSignature || !input.timestamp || !input.nonce || !input.echostr) {
    return { kind: 'error', status: 400, message: '缺少验证参数' }
  }
  const expected = wecomSignature(config.token, input.timestamp, input.nonce, input.echostr)
  if (!safeEqual(expected, input.msgSignature)) {
    return { kind: 'error', status: 401, message: '企业微信签名校验失败' }
  }
  try {
    const plain = decryptWecomMessage({
      encodingAesKey: config.encodingAesKey,
      encrypted: input.echostr,
      corpId: config.corpId,
    })
    return { kind: 'text', body: plain }
  } catch {
    return { kind: 'error', status: 400, message: '企业微信 echostr 解密失败' }
  }
}

export function handleWecomUpdate(input: {
  bot: BotAppRow
  config: WecomBotConfig
  query: Record<string, string | undefined>
  rawBody: string
  now?: number
}): PlatformHandleResult {
  const { bot, config, query, rawBody } = input
  const now = input.now ?? Date.now()
  if (!config.token || !config.encodingAesKey) {
    return { kind: 'error', status: 400, message: '企业微信尚未配置 Token / EncodingAESKey' }
  }

  const encrypted = xmlField(rawBody, 'Encrypt')
  if (!encrypted) return { kind: 'error', status: 400, message: '企业微信回调缺少 Encrypt' }
  const { msg_signature: signature, timestamp, nonce } = query
  if (!signature || !timestamp || !nonce) {
    return { kind: 'error', status: 400, message: '缺少签名参数' }
  }
  const expected = wecomSignature(config.token, timestamp, nonce, encrypted)
  if (!safeEqual(expected, signature)) {
    return { kind: 'error', status: 401, message: '企业微信签名校验失败' }
  }

  let plaintext: string
  try {
    plaintext = decryptWecomMessage({
      encodingAesKey: config.encodingAesKey,
      encrypted,
      corpId: config.corpId,
    })
  } catch {
    return { kind: 'error', status: 400, message: '企业微信消息解密失败' }
  }

  const msgType = xmlField(plaintext, 'MsgType')
  if (msgType !== 'text') return { kind: 'ignored', body: 'success' }
  const text = xmlField(plaintext, 'Content')?.trim() ?? ''
  const platformUserId = xmlField(plaintext, 'FromUserName')
  const msgId = xmlField(plaintext, 'MsgId')
  if (!text || !platformUserId || !msgId) return { kind: 'ignored', body: 'success' }

  return {
    kind: 'event',
    event: {
      platform: 'wecom',
      botApp: bot,
      ownerUserId: bot.user_id,
      platformMessageId: msgId,
      chatId: xmlField(plaintext, 'ChatId') ?? platformUserId,
      platformUserId,
      userName: null,
      text,
      reply: { type: 'wecom', toUser: platformUserId },
      receivedAt: now,
    },
  }
}
