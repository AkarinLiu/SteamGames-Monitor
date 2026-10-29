import { createHmac } from 'node:crypto'
import { assertSafeOutboundUrl } from '../urlGuard'
import type { DingtalkChannelConfig, RenderedMessage, SendResult } from '../types'

function signDingtalk(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`
  return createHmac('sha256', secret).update(stringToSign).digest('base64')
}

export async function sendDingtalk(
  config: DingtalkChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  const base = assertSafeOutboundUrl(config.webhookUrl)
  const url = new URL(base.toString())
  if (config.secret) {
    const timestamp = Date.now()
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('sign', signDingtalk(timestamp, config.secret))
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title: message.title, text: message.markdown },
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      error: `钉钉请求失败：${(error as Error)?.message ?? '网络错误'}`,
    }
  }

  let payload: { errcode?: number; errmsg?: string } = {}
  try {
    payload = (await response.json()) as { errcode?: number; errmsg?: string }
  } catch {
    return {
      ok: false,
      httpStatus: response.status,
      error: `钉钉返回非 JSON 响应（HTTP ${response.status}）`,
    }
  }

  if (payload.errcode === 0) return { ok: true, httpStatus: response.status }

  const errcode = payload.errcode ?? -1
  const error = `钉钉错误 ${errcode}：${payload.errmsg ?? '未知错误'}`
  if (errcode === 90037 || errcode === 130101 || response.status === 429) {
    return { ok: false, httpStatus: response.status, error, retryAfterMs: 60_000 }
  }
  if (errcode === 310000) {
    return { ok: false, httpStatus: response.status, error, permanent: true }
  }
  if (response.status >= 500) {
    return { ok: false, httpStatus: response.status, error, retryAfterMs: 60_000 }
  }
  return { ok: false, httpStatus: response.status, error, permanent: true }
}
