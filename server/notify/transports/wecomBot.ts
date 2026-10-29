import { truncateUtf8 } from '../../../shared/utils'
import { assertSafeOutboundUrl } from '../urlGuard'
import type { RenderedMessage, SendResult, WecomChannelConfig } from '../types'

const WECOM_MAX_BYTES = 4096

export async function sendWecom(
  config: WecomChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  const url = assertSafeOutboundUrl(config.webhookUrl)
  const content = truncateUtf8(message.markdown, WECOM_MAX_BYTES - 200)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content },
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      error: `企业微信请求失败：${(error as Error)?.message ?? '网络错误'}`,
    }
  }

  const text = await response.text()
  let payload: { errcode?: number; errmsg?: string } = {}
  try {
    payload = JSON.parse(text) as { errcode?: number; errmsg?: string }
  } catch {
    return {
      ok: false,
      httpStatus: response.status,
      error: `企业微信返回非 JSON 响应（HTTP ${response.status}）`,
    }
  }

  if (payload.errcode === 0) {
    return { ok: true, httpStatus: response.status }
  }

  const errcode = payload.errcode ?? -1
  const error = `企业微信错误 ${errcode}：${payload.errmsg ?? '未知错误'}`
  if (errcode === 45009) return { ok: false, httpStatus: response.status, error, retryAfterMs: 60_000 }
  if (response.status === 429 || response.status >= 500) {
    return { ok: false, httpStatus: response.status, error, retryAfterMs: 60_000 }
  }
  return { ok: false, httpStatus: response.status, error, permanent: true }
}
