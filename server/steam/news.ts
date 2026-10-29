import type { Db } from '../db/database'
import { getNewsCache, putNewsCache } from '../db/repo/caches'
import { safeJsonParse, stripHtml, truncateText } from '../../shared/utils'
import type { SteamRateLimiter } from '../monitor/rateLimiter'
import { env } from '../env'
import { steamFetchJson } from './client'
import type { SteamNewsItem } from './types'

export const NEWS_CACHE_TTL_MS = 6 * 60 * 60_000
const MAX_CONTENT_CHARS = 2000

interface NewsApiItem {
  gid?: number | string
  title?: string
  url?: string
  contents?: string
  date?: number
  feedname?: string
}

interface NewsApiPayload {
  appnews?: { newsitems?: NewsApiItem[] }
}

export interface NewsFetchResult {
  items: SteamNewsItem[]
  fetchedAt: number
  fromCache: boolean
}

export function buildNewsUrl(appid: number): string {
  return `${env.STEAM_API_BASE_URL}/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=20&maxlength=1000`
}

function normalizeNewsItem(raw: NewsApiItem): SteamNewsItem | null {
  const gid = raw.gid === undefined || raw.gid === null ? null : String(raw.gid)
  if (!gid) return null
  return {
    gid,
    title: (raw.title ?? '').trim(),
    url: (raw.url ?? '').trim(),
    contents: truncateText(stripHtml(raw.contents ?? ''), MAX_CONTENT_CHARS),
    date: typeof raw.date === 'number' ? raw.date * 1000 : 0,
    feedName: (raw.feedname ?? '').trim(),
  }
}

export async function fetchNews(
  db: Db,
  appid: number,
  options: {
    force?: boolean
    cacheTtlMs?: number
    limiter?: SteamRateLimiter
    signal?: AbortSignal
    now?: () => number
  } = {},
): Promise<NewsFetchResult> {
  const now = options.now ?? Date.now
  const ttl = options.cacheTtlMs ?? NEWS_CACHE_TTL_MS

  if (!options.force) {
    const cached = getNewsCache(db, appid)
    if (cached && now() - Number(cached.fetched_at) <= ttl) {
      const items = safeJsonParse<SteamNewsItem[]>(cached.payload_json, [])
      if (Array.isArray(items)) {
        return { items, fetchedAt: Number(cached.fetched_at), fromCache: true }
      }
    }
  }

  const response = await steamFetchJson<NewsApiPayload>(buildNewsUrl(appid), {
    limiter: options.limiter,
    maxWaitMs: 20_000,
    signal: options.signal,
    timeoutMs: 20_000,
  })

  const rawItems = response.data?.appnews?.newsitems
  const items: SteamNewsItem[] = []
  if (Array.isArray(rawItems)) {
    for (const raw of rawItems) {
      const item = normalizeNewsItem(raw)
      if (item) items.push(item)
    }
  }

  const fetchedAt = now()
  putNewsCache(db, { appid, payloadJson: JSON.stringify(items), fetchedAt })
  return { items, fetchedAt, fromCache: false }
}
