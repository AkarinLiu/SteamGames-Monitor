import { assertSafeOutboundUrl } from '../urlGuard'
import type { GotifyChannelConfig, RenderedMessage, SendResult } from '../types'

function messageEndpoint(raw: string): URL {
  const url = new URL(assertSafeOutboundUrl(raw).toString())
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/message`
  url.search = ''
  url.hash = ''
  return url
}

export async function sendGotify(
  config: GotifyChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  const url = messageEndpoint(config.serverUrl)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gotify-key': config.token,
      },
      body: JSON.stringify({
        title: message.title,
        message: message.markdown,
        priority: config.priority ?? 5,
        extras: { 'client::display': { contentType: 'text/markdown' } },
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      error: `Gotify 请求失败：${(error as Error)?.message ?? '网络错误'}`,
    }
  }

  if (response.ok) {
    try {
      await response.body?.cancel()
    } catch {
      // The status is enough for delivery accounting.
    }
    return { ok: true, httpStatus: response.status }
  }

  let detail = ''
  try {
    const payload = (await response.json()) as { error?: string }
    detail = payload.error ?? ''
  } catch {
    detail = ''
  }

  const error = `Gotify 返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`
  const retry = response.status === 429 || response.status >= 500
  return {
    ok: false,
    httpStatus: response.status,
    error,
    retryAfterMs: retry ? 60_000 : undefined,
    permanent: !retry,
  }
}
