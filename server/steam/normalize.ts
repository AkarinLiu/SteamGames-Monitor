import type { NormalizedApp, NormalizedPrice } from './types'

type Json = Record<string, unknown>

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function normalizePrice(raw: unknown): NormalizedPrice | null {
  if (!raw || typeof raw !== 'object') return null
  const price = raw as Json
  const currency = asString(price.currency)
  const initialRaw = asNumber(price.initial)
  const finalRaw = asNumber(price.final)
  if (!currency || initialRaw === null || finalRaw === null) return null
  const discountPercent = Math.max(0, Math.min(100, Math.round(asNumber(price.discount_percent) ?? 0)))
  const fallbackFormatted = (value: number) => `${currency} ${(value / 100).toFixed(2)}`
  return {
    currency,
    initialRaw,
    finalRaw,
    discountPercent,
    initialFormatted: asString(price.initial_formatted) ?? fallbackFormatted(initialRaw),
    finalFormatted: asString(price.final_formatted) ?? fallbackFormatted(finalRaw),
  }
}

function normalizeDlcIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const ids: number[] = []
  for (const item of raw) {
    const value = asNumber(item)
    if (value !== null && Number.isSafeInteger(value) && value > 0) ids.push(value)
  }
  return ids
}

export function normalizeAppDetails(appid: number, raw: unknown): NormalizedApp | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Json
  const type = asString(data.type)
  if (type !== 'game' && type !== 'dlc') return null

  const releaseRaw =
    data.release_date && typeof data.release_date === 'object'
      ? (data.release_date as Json)
      : null

  const fullgameRaw =
    data.fullgame && typeof data.fullgame === 'object' ? (data.fullgame as Json) : null
  const fullgameAppid = fullgameRaw ? asNumber(fullgameRaw.appid) : null

  return {
    appid: asNumber(data.steam_appid) ?? appid,
    kind: type === 'dlc' ? 'dlc' : 'game',
    name: asString(data.name) ?? `App ${appid}`,
    isFree: data.is_free === true,
    release: {
      comingSoon: releaseRaw?.coming_soon === true,
      dateText: releaseRaw ? asString(releaseRaw.date) : null,
    },
    price: normalizePrice(data.price_overview),
    dlcIds: normalizeDlcIds(data.dlc),
    fullgame:
      fullgameAppid !== null && Number.isSafeInteger(fullgameAppid) && fullgameAppid > 0
        ? { appid: fullgameAppid, name: asString(fullgameRaw?.name) ?? `App ${fullgameAppid}` }
        : null,
    headerImage: asString(data.header_image),
    shortDescription: asString(data.short_description),
  }
}
