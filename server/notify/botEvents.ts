import { safeJsonParse } from '../../shared/utils'
import type { Db } from '../db/database'
import type { BotAppRow, DeliveryRow } from '../db/rows'
import type { BotConfig, DingtalkBotConfig, FeishuBotConfig } from '../inbound/types'
import { sendFeishuChatText } from '../inbound/reply'
import { splitReply } from '../inbound/commands/format'
import { botAad, decryptConfig, SecretDecryptError } from './secrets'
import { assertSafeOutboundUrl } from './urlGuard'
import type { RenderedMessage, SendResult } from './types'

const DINGTALK_API = 'https://api.dingtalk.com'

interface BotEventTarget {
  chatId: string
  chatType: 'single' | 'group' | null
}

interface DingtalkToken {
  token: string
  expiresAt: number
}

const dingtalkTokens = new Map<string, DingtalkToken>()

export interface BotEventServices {
  sendWecom: (
    botId: number,
    target: { chatId: string; chatType: 'single' | 'group' },
    text: string,
  ) => Promise<SendResult>
}

function failure(error: string, permanent = false, httpStatus: number | null = null): SendResult {
  return { ok: false, httpStatus, error, permanent }
}

function apiBase(override: string | null | undefined, fallback: string): string {
  return (override ?? fallback).replace(/\/+$/, '')
}

function guard(raw: string): string {
  return assertSafeOutboundUrl(raw).toString()
}

function parseTarget(delivery: DeliveryRow): BotEventTarget | null {
  const target = safeJsonParse<Record<string, unknown>>(delivery.target_json, {}) ?? {}
  const chatId = typeof target.chatId === 'string' ? target.chatId.trim() : ''
  if (!chatId) return null
  const chatType =
    target.chatType === 'single' || target.chatType === 'group'
      ? target.chatType
      : null
  return { chatId, chatType }
}

export async function sendBotEvent(
  db: Db,
  bot: BotAppRow,
  delivery: DeliveryRow,
  message: RenderedMessage,
  services: BotEventServices,
): Promise<SendResult> {
  const target = parseTarget(delivery)
  if (!target) return failure('机器人通知目标缺失', true)

  let config: BotConfig
  try {
    config = decryptConfig<BotConfig>(bot.config_enc, botAad(bot.user_id, bot.platform))
  } catch (error) {
    if (error instanceof SecretDecryptError) return failure(error.message, true)
    throw error
  }

  if (bot.platform === 'feishu') {
    const feishu = config as FeishuBotConfig
    if (!feishu.appId || !feishu.appSecret) {
      return failure('请填写飞书 App ID 和 App Secret 后才能推送事件', true)
    }
    return sendFeishuChatText(
      apiBase(bot.api_base_url, 'https://open.feishu.cn'),
      feishu,
      target.chatId,
      message.text,
    )
  }

  if (bot.platform === 'dingtalk') {
    const dingtalk = config as DingtalkBotConfig
    if (!dingtalk.appKey || !dingtalk.appSecret || !dingtalk.robotCode) {
      return failure('请填写钉钉 App Key、App Secret 和 Robot Code 后才能推送事件', true)
    }
    if (!target.chatType) {
      return failure('钉钉通知缺少会话类型，请让授权用户在单聊或群聊中重新发送指令', true)
    }
    return sendDingtalkEvent(
      apiBase(bot.api_base_url, DINGTALK_API),
      dingtalk,
      target,
      message,
    )
  }

  if (bot.platform === 'wecom') {
    if (!target.chatType) {
      return failure('企业微信通知缺少会话类型，请让授权用户重新发送指令', true)
    }
    return services.sendWecom(
      bot.id,
      { chatId: target.chatId, chatType: target.chatType },
      message.markdown,
    )
  }

  return failure(`不支持的机器人平台：${bot.platform}`, true)
}

async function getDingtalkToken(
  base: string,
  appKey: string,
  appSecret: string,
): Promise<string | null> {
  const key = `${base}:${appKey}`
  const cached = dingtalkTokens.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  try {
    const response = await fetch(guard(`${base}/v1.0/oauth2/accessToken`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appKey, appSecret }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const payload = (await response.json().catch(() => null)) as {
      accessToken?: string
      expireIn?: number | string
    } | null
    if (!payload?.accessToken) return null
    const expiresIn = Number(payload.expireIn ?? 7200)
    dingtalkTokens.set(key, {
      token: payload.accessToken,
      expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000,
    })
    return payload.accessToken
  } catch {
    return null
  }
}

async function sendDingtalkEvent(
  base: string,
  config: DingtalkBotConfig,
  target: BotEventTarget,
  message: RenderedMessage,
): Promise<SendResult> {
  const appKey = config.appKey!
  const appSecret = config.appSecret!
  const robotCode = config.robotCode!
  let token = await getDingtalkToken(base, appKey, appSecret)
  if (!token) return failure('钉钉 access_token 获取失败')

  const chatType = target.chatType!
  const url =
    chatType === 'group'
      ? guard(`${base}/v1.0/robot/groupMessages/send`)
      : guard(`${base}/v1.0/robot/oToMessages/batchSend`)

  for (const chunk of splitReply(message.markdown, 'dingtalk')) {
    const body =
      chatType === 'group'
        ? {
            robotCode,
            openConversationId: target.chatId,
            msgKey: 'sampleMarkdown',
            msgParam: JSON.stringify({ title: message.title, text: chunk }),
          }
        : {
            robotCode,
            userIds: [target.chatId],
            msgKey: 'sampleMarkdown',
            msgParam: JSON.stringify({ title: message.title, text: chunk }),
          }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-acs-dingtalk-access-token': token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
      if (response.status === 401) {
        dingtalkTokens.delete(`${base}:${appKey}`)
        token = await getDingtalkToken(base, appKey, appSecret)
        if (!token) return failure('钉钉 access_token 已失效，请重试')
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-acs-dingtalk-access-token': token,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        })
      }
    } catch (error) {
      return failure(`钉钉主动消息请求失败：${(error as Error).message}`)
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => '')
      let detail = ''
      try {
        const payload = JSON.parse(raw) as { message?: string; code?: string }
        detail = payload.message ?? payload.code ?? ''
      } catch {
        detail = raw.slice(0, 200)
      }
      const retry =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500
      return failure(
        `钉钉主动消息发送失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
        !retry,
        response.status,
      )
    }
    if (response.body) {
      try {
        await response.body.cancel()
      } catch {
        // Status is enough.
      }
    }
  }

  return { ok: true, httpStatus: 200 }
}
