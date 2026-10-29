import type { SteamSearchResult } from '../../shared/types'
import { steamFetchJson } from './client'
import type { SteamRateLimiter } from '../monitor/rateLimiter'
import { env } from '../env'

interface StoreSearchItem {
  type?: string
  id?: number
  name?: string
  tiny_image?: string
  price?: {
    currency?: string
    final?: number
    initial?: number
    discount_percent?: number
    final_formatted?: string
  }
}

interface StoreSearchPayload {
  success?: boolean
  total?: number
  items?: StoreSearchItem[]
}

const SEARCH_CACHE_TTL_MS = 5 * 60_000
const searchCache = new Map<string, { expiresAt: number; results: SteamSearchResult[] }>()

export async function searchStore(
  term: string,
  region: string,
  language: string,
  options: { limiter?: SteamRateLimiter; signal?: AbortSignal; limit?: number } = {},
): Promise<SteamSearchResult[]> {
  const key = `${region}:${language}:${term.trim().toLowerCase()}`
  const cached = searchCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.results.slice(0, options.limit ?? 5)

  const params = new URLSearchParams({ term: term.trim(), l: language, cc: region })
  const response = await steamFetchJson<StoreSearchPayload>(
    `${env.STEAM_STORE_BASE_URL}/api/storesearch/?${params.toString()}`,
    { limiter: options.limiter, maxWaitMs: 15_000, signal: options.signal },
  )

  const items = Array.isArray(response.data?.items) ? response.data.items : []
  const results: SteamSearchResult[] = []
  for (const item of items) {
    const appid = Number(item.id)
    if (!Number.isSafeInteger(appid) || appid <= 0) continue
    const price = item.price
    const priceText =
      price && typeof price.final === 'number'
        ? (price.final_formatted ??
          `${price.currency ?? ''} ${(price.final / 100).toFixed(2)}`.trim())
        : null
    results.push({
      appid,
      name: item.name ?? `App ${appid}`,
      type: item.type ?? 'game',
      tinyImage: item.tiny_image ?? null,
      priceText,
    })
  }

  searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results })
  if (searchCache.size > 200) {
    const firstKey = searchCache.keys().next().value
    if (firstKey !== undefined) searchCache.delete(firstKey)
  }
  return results.slice(0, options.limit ?? 5)
}
