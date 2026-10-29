import type { Db } from '../db/database'
import { getSteamCache, putSteamCache } from '../db/repo/caches'
import { safeJsonParse } from '../../shared/utils'
import type { SteamRateLimiter } from '../monitor/rateLimiter'
import { env } from '../env'
import { steamFetchJson, SteamRequestError } from './client'
import { normalizeAppDetails } from './normalize'
import type { AppDetailsResult, NormalizedApp } from './types'

export const STEAM_CACHE_TTL_MS = 10 * 60_000

export interface AppDetailsOptions {
  force?: boolean
  cacheTtlMs?: number
  limiter?: SteamRateLimiter
  maxWaitMs?: number
  signal?: AbortSignal
  now?: () => number
}

interface AppDetailsPayload {
  success?: boolean
  data?: unknown
}

export function buildAppDetailsUrl(appid: number, region: string, language: string): string {
  const params = new URLSearchParams({
    appids: String(appid),
    cc: region,
    l: language,
  })
  return `${env.STEAM_STORE_BASE_URL}/api/appdetails?${params.toString()}`
}

export async function fetchAppDetails(
  db: Db,
  appid: number,
  region: string,
  language: string,
  options: AppDetailsOptions = {},
): Promise<AppDetailsResult> {
  const now = options.now ?? Date.now
  const startedAt = now()
  const ttl = options.cacheTtlMs ?? STEAM_CACHE_TTL_MS

  if (!options.force) {
    const cached = getSteamCache(db, appid, region, language)
    if (cached && now() - Number(cached.fetched_at) <= ttl) {
      const app = safeJsonParse<NormalizedApp | null>(cached.normalized_json, null)
      if (app && typeof app === 'object' && app.appid) {
        return {
          status: 'ok',
          app,
          fetchedAt: Number(cached.fetched_at),
          fromCache: true,
          durationMs: 0,
          httpStatus: null,
        }
      }
    }
  }

  const response = await steamFetchJson<Record<string, AppDetailsPayload>>(
    buildAppDetailsUrl(appid, region, language),
    {
      limiter: options.limiter,
      maxWaitMs: options.maxWaitMs ?? 15_000,
      signal: options.signal,
    },
  )

  const payload = response.data?.[String(appid)]
  if (!payload || payload.success !== true) {
    return {
      status: 'not_found',
      appid,
      fetchedAt: now(),
      fromCache: false,
      durationMs: response.durationMs,
      httpStatus: response.status,
    }
  }
  if (!payload.data) {
    throw new SteamRequestError('empty_data', 'Steam 返回了空的游戏数据', {
      httpStatus: response.status,
    })
  }

  const app = normalizeAppDetails(appid, payload.data)
  if (!app) {
    throw new SteamRequestError('empty_data', '该条目不是游戏或 DLC，无法监控', {
      httpStatus: response.status,
    })
  }

  const fetchedAt = now()
  putSteamCache(db, {
    appid,
    region,
    language,
    normalizedJson: JSON.stringify(app),
    fetchedAt,
  })

  return {
    status: 'ok',
    app,
    fetchedAt,
    fromCache: false,
    durationMs: now() - startedAt,
    httpStatus: response.status,
  }
}
