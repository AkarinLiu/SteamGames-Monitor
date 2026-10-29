import { logger } from '../lib/logger'
import type { SteamRateLimiter } from '../monitor/rateLimiter'
import type { SteamErrorCode } from './types'

const DEFAULT_TIMEOUT_MS = 15_000
const USER_AGENT = 'SteamGamesMonitor/1.0 (+self-hosted)'
const RATE_LIMIT_COOLDOWN_MS = 2 * 60_000
const FORBIDDEN_COOLDOWN_MS = 10 * 60_000

const log = logger.child('steam')

export class SteamRequestError extends Error {
  readonly code: SteamErrorCode
  readonly httpStatus: number | null
  readonly retryAfterMs: number | null

  constructor(
    code: SteamErrorCode,
    message: string,
    options: { httpStatus?: number | null; retryAfterMs?: number | null } = {},
  ) {
    super(message)
    this.name = 'SteamRequestError'
    this.code = code
    this.httpStatus = options.httpStatus ?? null
    this.retryAfterMs = options.retryAfterMs ?? null
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return null
}

export interface SteamFetchResult<T> {
  data: T
  status: number
  durationMs: number
}

export interface SteamFetchOptions {
  timeoutMs?: number
  signal?: AbortSignal
  limiter?: SteamRateLimiter
  maxWaitMs?: number
}

export async function steamFetchJson<T>(
  url: string,
  options: SteamFetchOptions = {},
): Promise<SteamFetchResult<T>> {
  const { limiter } = options
  if (limiter && (options.maxWaitMs ?? 0) > 0) {
    const acquired = await limiter.acquire(options.maxWaitMs ?? 0, options.signal)
    if (!acquired) {
      throw new SteamRequestError('rate_limited', '本地限流等待超时', { retryAfterMs: 60_000 })
    }
  } else if (limiter) {
    const result = limiter.tryAcquire()
    if (!result.ok) {
      throw new SteamRequestError('rate_limited', '本地限流冷却中', { retryAfterMs: result.waitMs })
    }
  }

  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal,
      redirect: 'follow',
    })
  } catch (error) {
    if (timeoutSignal.aborted || (error as Error)?.name === 'TimeoutError') {
      throw new SteamRequestError('timeout', `请求超时（${timeoutMs}ms）`)
    }
    if ((error as Error)?.name === 'AbortError') throw error
    throw new SteamRequestError('network', (error as Error)?.message ?? '网络请求失败')
  }

  const durationMs = Date.now() - startedAt

  if (response.status === 429 || response.status === 503) {
    const retryAfterMs = Math.max(
      parseRetryAfter(response.headers.get('retry-after')) ?? 0,
      RATE_LIMIT_COOLDOWN_MS,
    )
    limiter?.setCooldown(retryAfterMs)
    log.warn('Steam 限流', { status: response.status, retryAfterMs, url })
    throw new SteamRequestError('rate_limited', `Steam 返回 ${response.status}`, {
      httpStatus: response.status,
      retryAfterMs,
    })
  }

  if (response.status === 403) {
    limiter?.setCooldown(FORBIDDEN_COOLDOWN_MS)
    throw new SteamRequestError('forbidden', 'Steam 拒绝访问（403）', {
      httpStatus: 403,
      retryAfterMs: FORBIDDEN_COOLDOWN_MS,
    })
  }

  if (!response.ok) {
    throw new SteamRequestError('http', `Steam 返回 ${response.status}`, {
      httpStatus: response.status,
    })
  }

  let data: T
  try {
    data = (await response.json()) as T
  } catch {
    throw new SteamRequestError('invalid_json', 'Steam 返回了无效的 JSON', {
      httpStatus: response.status,
    })
  }

  return { data, status: response.status, durationMs }
}

export async function fetchText(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; status: number }> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/plain, */*' },
      signal,
    })
    return { text: await response.text(), status: response.status }
  } catch (error) {
    if (timeoutSignal.aborted || (error as Error)?.name === 'TimeoutError') {
      throw new SteamRequestError('timeout', '请求超时')
    }
    throw new SteamRequestError('network', (error as Error)?.message ?? '网络请求失败')
  }
}
