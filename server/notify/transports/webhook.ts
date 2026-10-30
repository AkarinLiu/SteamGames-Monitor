import { createHmac } from 'node:crypto'
import { assertSafeOutboundUrl } from '../urlGuard'
import type { RenderedMessage, SendResult, WebhookChannelConfig } from '../types'

export async function sendWebhook(
  config: WebhookChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  const url = assertSafeOutboundUrl(config.webhookUrl)
  const body = JSON.stringify(message.webhook)
  const timestamp = Date.now()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    'user-agent': 'SteamGames-Monitor/1.0',
    'x-sgm-event': message.webhook.eventType ?? 'test',
    'x-sgm-timestamp': String(timestamp),
  }
  if (config.authorization) headers.authorization = config.authorization
  if (config.secret) {
    headers['x-sgm-signature'] = `sha256=${createHmac('sha256', config.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      error: `Webhook 请求失败：${(error as Error)?.message ?? '网络错误'}`,
    }
  }

  if (response.body) {
    try {
      await response.body.cancel()
    } catch {
      // The status is enough for delivery accounting.
    }
  }

  if (response.ok) return { ok: true, httpStatus: response.status }

  const retry =
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500
  return {
    ok: false,
    httpStatus: response.status,
    error: `Webhook 返回 HTTP ${response.status}`,
    retryAfterMs: retry ? 60_000 : undefined,
    permanent: !retry,
  }
}
