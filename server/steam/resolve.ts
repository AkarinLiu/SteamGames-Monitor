import type { SteamSearchResult } from '../../shared/types'
import { extractAppid } from '../../shared/utils'
import type { SteamRateLimiter } from '../monitor/rateLimiter'
import { searchStore } from './storesearch'

export type ResolveResult =
  | { kind: 'appid'; appid: number }
  | { kind: 'search'; query: string; results: SteamSearchResult[] }

export function normalizeSearchName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function resolveMonitorQuery(
  query: string,
  region: string,
  language: string,
  options: { limiter?: SteamRateLimiter; signal?: AbortSignal } = {},
): Promise<ResolveResult> {
  const appid = extractAppid(query)
  if (appid !== null) return { kind: 'appid', appid }

  const trimmed = query.trim()
  const results = await searchStore(trimmed, region, language, {
    limiter: options.limiter,
    signal: options.signal,
    limit: 5,
  })

  const target = normalizeSearchName(trimmed)
  const exact = results.filter((item) => normalizeSearchName(item.name) === target)
  if (exact.length === 1 && exact[0]) {
    return { kind: 'appid', appid: exact[0].appid }
  }

  return { kind: 'search', query: trimmed, results }
}
