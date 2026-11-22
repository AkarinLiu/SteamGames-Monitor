import { assertSafeOutboundUrl } from '../urlGuard'
import type { BarkChannelConfig, RenderedMessage, SendResult } from '../types'

function pushEndpoint(raw: string): URL {
  const url = new URL(assertSafeOutboundUrl(raw).toString())
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/push`
  url.search = ''
  url.hash = ''
  return url
}

export async function sendBark(
  config: BarkChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  const url = pushEndpoint(config.serverUrl)
  const body: Record<string, unknown> = {
    device_key: config.deviceKey,
    title: message.title,
    body: message.text,
  }
  if (config.group) body.group = config.group
  const storeUrl = message.webhook.monitor?.storeUrl
  if (storeUrl) body.url = storeUrl

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
      error: `Bark 请求失败：${(error as Error)?.message ?? '网络错误'}`,
    }
  }

  let payload: { code?: number | string; message?: string } = {}
  try {
    payload = (await response.json()) as { code?: number | string; message?: string }
  } catch {
    return {
      ok: false,
      httpStatus: response.status,
      error: `Bark 返回非 JSON 响应（HTTP ${response.status}）`,
      retryAfterMs: response.status >= 500 ? 60_000 : undefined,
      permanent: response.status < 500,
    }
  }

  const code = Number(payload.code ?? (response.ok ? 200 : response.status))
  if (response.ok && code === 200) return { ok: true, httpStatus: response.status }

  const error = `Bark 错误 ${code}：${payload.message ?? `HTTP ${response.status}`}`
  const retry = code === 429 || response.status === 429 || response.status >= 500
  return {
    ok: false,
    httpStatus: response.status,
    error,
    retryAfterMs: retry ? 60_000 : undefined,
    permanent: !retry,
  }
}
