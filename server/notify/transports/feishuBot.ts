import { createHmac } from 'node:crypto'
import { assertSafeOutboundUrl } from '../urlGuard'
import type { FeishuChannelConfig, RenderedMessage, SendResult } from '../types'

function signFeishu(timestamp: number, secret: string): string {
  const key = `${timestamp}\n${secret}`
  return createHmac('sha256', key).update('').digest('base64')
}

export async function sendFeishu(
  config: FeishuChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  const url = assertSafeOutboundUrl(config.webhookUrl)
  const body: Record<string, unknown> = {
    msg_type: 'interactive',
    card: message.card,
  }
  if (config.secret) {
    const timestamp = Math.floor(Date.now() / 1000)
    body.timestamp = String(timestamp)
    body.sign = signFeishu(timestamp, config.secret)
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      error: `飞书请求失败：${(error as Error)?.message ?? '网络错误'}`,
    }
  }

  let payload: { code?: number; msg?: string; StatusCode?: number } = {}
  try {
    payload = (await response.json()) as { code?: number; msg?: string; StatusCode?: number }
  } catch {
    return {
      ok: false,
      httpStatus: response.status,
      error: `飞书返回非 JSON 响应（HTTP ${response.status}）`,
    }
  }

  const code = payload.code ?? payload.StatusCode ?? 0
  if (code === 0 && response.ok) return { ok: true, httpStatus: response.status }

  const error = `飞书错误 ${code}：${payload.msg ?? '未知错误'}`
  if (code === 9499 || code === 19021 || code === 11232 || response.status === 429) {
    return { ok: false, httpStatus: response.status, error, retryAfterMs: 60_000 }
  }
  if (response.status >= 500) {
    return { ok: false, httpStatus: response.status, error, retryAfterMs: 60_000 }
  }
  return { ok: false, httpStatus: response.status, error, permanent: true }
}
