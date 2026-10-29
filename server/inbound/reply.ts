import { splitReply } from './commands/format'
import type { DeliveryRow } from '../db/rows'
import type { Db } from '../db/database'
import { findBotByIdInternal } from '../db/repo/bots'
import { decryptConfig, botAad, SecretDecryptError } from '../notify/secrets'
import { assertSafeOutboundUrl } from '../notify/urlGuard'
import type { SendResult } from '../notify/types'
import { safeJsonParse } from '../../shared/utils'
import type {
  BotConfig,
  DingtalkReplyTarget,
  FeishuBotConfig,
  FeishuReplyTarget,
  ReplyTarget,
  WecomBotConfig,
  WecomReplyTarget,
} from './types'

const FEISHU_API = 'https://open.feishu.cn'
const WECOM_API = 'https://qyapi.weixin.qq.com'

interface CachedToken {
  token: string
  expiresAt: number
}

const feishuTokens = new Map<string, CachedToken>()
const feishuInflight = new Map<string, Promise<CachedToken | null>>()
const wecomTokens = new Map<string, CachedToken>()
const wecomInflight = new Map<string, Promise<CachedToken | null>>()

function failure(error: string, permanent = false, httpStatus: number | null = null): SendResult {
  return { ok: false, httpStatus, error, permanent }
}

function apiBase(override: string | null | undefined, fallback: string): string {
  return (override ?? fallback).replace(/\/+$/, '')
}

function guard(raw: string): string {
  return assertSafeOutboundUrl(raw).toString()
}

async function getFeishuToken(config: FeishuBotConfig, base: string): Promise<CachedToken | null> {
  if (!config.appId || !config.appSecret) return null
  const key = `${base}:${config.appId}`
  const cached = feishuTokens.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached
  const existing = feishuInflight.get(key)
  if (existing) return existing
  const task = (async () => {
    try {
      const response = await fetch(guard(`${base}/open-apis/auth/v3/tenant_access_token/internal`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
        signal: AbortSignal.timeout(10_000),
      })
      const payload = (await response.json()) as {
        code?: number
        msg?: string
        tenant_access_token?: string
        expire?: number
      }
      if (payload.code !== 0 || !payload.tenant_access_token) return null
      const token = {
        token: payload.tenant_access_token,
        expiresAt: Date.now() + Number(payload.expire ?? 7200) * 1000 - 300_000,
      }
      feishuTokens.set(key, token)
      return token
    } catch {
      return null
    } finally {
      feishuInflight.delete(key)
    }
  })()
  feishuInflight.set(key, task)
  return task
}

async function sendFeishuReply(
  botId: number,
  base: string,
  config: FeishuBotConfig,
  target: FeishuReplyTarget,
  text: string,
): Promise<SendResult> {
  const token = await getFeishuToken(config, base)
  if (!token) return failure('飞书 tenant_access_token 获取失败', true)
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token.token}`,
  }

  for (const chunk of splitReply(text, 'feishu')) {
    const replyBody = JSON.stringify({
      msg_type: 'text',
      content: JSON.stringify({ text: chunk }),
    })
    let response = await fetch(
      guard(`${base}/open-apis/im/v1/messages/${encodeURIComponent(target.messageId)}/reply`),
      { method: 'POST', headers, body: replyBody, signal: AbortSignal.timeout(15_000) },
    )
    let payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string }
    if (payload.code === 0) continue

    response = await fetch(
      guard(`${base}/open-apis/im/v1/messages?receive_id_type=chat_id`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          receive_id: target.chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: chunk }),
          uuid: `sgm-${botId}-${Date.now()}`,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string }
    if (payload.code !== 0) {
      return failure(`飞书回复失败：${payload.msg ?? payload.code ?? '未知错误'}`)
    }
  }
  return { ok: true, httpStatus: 200 }
}

async function sendDingtalkReply(
  target: DingtalkReplyTarget,
  text: string,
): Promise<SendResult> {
  if (!target.sessionWebhook) return failure('钉钉会话 Webhook 缺失', true)
  if (target.expiresAt && target.expiresAt < Date.now() + 5_000) {
    return failure('钉钉会话 Webhook 已过期', true)
  }
  const chunks = splitReply(text, 'dingtalk')
  for (const chunk of chunks) {
    const response = await fetch(guard(target.sessionWebhook), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title: 'Steam 监控', text: chunk },
        at: target.userId ? { atUserIds: [target.userId] } : undefined,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      errcode?: number
      errmsg?: string
    }
    if (payload.errcode !== 0) {
      return failure(`钉钉回复失败：${payload.errmsg ?? payload.errcode ?? '未知错误'}`)
    }
  }
  return { ok: true, httpStatus: 200 }
}

async function getWecomToken(config: WecomBotConfig, base: string): Promise<CachedToken | null> {
  if (!config.corpId || !config.corpSecret) return null
  const key = `${base}:${config.corpId}`
  const cached = wecomTokens.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached
  const existing = wecomInflight.get(key)
  if (existing) return existing
  const task = (async () => {
    try {
      const url = new URL(guard(`${base}/cgi-bin/gettoken`))
      url.searchParams.set('corpid', config.corpId!)
      url.searchParams.set('corpsecret', config.corpSecret!)
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const payload = (await response.json()) as {
        errcode?: number
        access_token?: string
        expires_in?: number
      }
      if (payload.errcode !== 0 || !payload.access_token) return null
      const token = {
        token: payload.access_token,
        expiresAt: Date.now() + Number(payload.expires_in ?? 7200) * 1000 - 300_000,
      }
      wecomTokens.set(key, token)
      return token
    } catch {
      return null
    } finally {
      wecomInflight.delete(key)
    }
  })()
  wecomInflight.set(key, task)
  return task
}

async function sendWecomReply(
  base: string,
  config: WecomBotConfig,
  target: WecomReplyTarget,
  text: string,
): Promise<SendResult> {
  if (!config.agentId) return failure('企业微信 AgentID 缺失', true)
  const token = await getWecomToken(config, base)
  if (!token) return failure('企业微信 access_token 获取失败', true)

  for (const chunk of splitReply(text, 'wecom')) {
    const response = await fetch(guard(`${base}/cgi-bin/message/send?access_token=${encodeURIComponent(token.token)}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: target.toUser,
        msgtype: 'text',
        agentid: Number(config.agentId),
        text: { content: chunk },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      errcode?: number
      errmsg?: string
    }
    if (payload.errcode === 40014 || payload.errcode === 42001) {
      wecomTokens.clear()
      return failure('企业微信 access_token 已失效，请重试')
    }
    if (payload.errcode !== 0) {
      return failure(`企业微信回复失败：${payload.errmsg ?? payload.errcode ?? '未知错误'}`)
    }
  }
  return { ok: true, httpStatus: 200 }
}

export async function sendCommandDelivery(db: Db, delivery: DeliveryRow): Promise<SendResult> {
  if (!delivery.bot_app_id) return failure('指令回复缺少机器人', true)
  const bot = findBotByIdInternal(db, delivery.bot_app_id)
  if (!bot) return failure('机器人已删除', true)
  if (bot.enabled !== 1) return { ok: false, httpStatus: null, canceled: true }

  let config: BotConfig
  try {
    config = decryptConfig<BotConfig>(bot.config_enc, botAad(bot.user_id, bot.platform))
  } catch (error) {
    if (error instanceof SecretDecryptError) return failure(error.message, true)
    throw error
  }

  const target = (safeJsonParse<{ reply?: ReplyTarget }>(delivery.target_json, {}) ?? {}).reply
  if (!target) return failure('指令回复目标缺失', true)
  const payload = safeJsonParse<{ text?: string }>(delivery.payload_json, {}) ?? {}
  const text = payload.text ?? ''
  if (!text) return failure('指令回复内容为空', true)

  try {
    if (target.type === 'feishu') {
      return await sendFeishuReply(
        bot.id,
        apiBase(bot.api_base_url, FEISHU_API),
        config as FeishuBotConfig,
        target,
        text,
      )
    }
    if (target.type === 'dingtalk') {
      return await sendDingtalkReply(target, text)
    }
    if (target.type === 'wecom') {
      return await sendWecomReply(
        apiBase(bot.api_base_url, WECOM_API),
        config as WecomBotConfig,
        target,
        text,
      )
    }
    return failure(`未知回复平台：${(target as { type?: string }).type ?? 'unknown'}`, true)
  } catch (error) {
    return failure((error as Error)?.message ?? '回复发送失败')
  }
}
