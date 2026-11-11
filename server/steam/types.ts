import type { MonitorKind } from '../../shared/types'

export interface NormalizedPrice {
  currency: string
  initialRaw: number
  finalRaw: number
  discountPercent: number
  initialFormatted: string
  finalFormatted: string
}

export interface NormalizedRelease {
  comingSoon: boolean
  dateText: string | null
}

/**
 * Why Steam did not return `price_overview` for an app.
 *
 * Steam responds with `success: true` and no `price_overview` when an app can no
 * longer be purchased, so an empty price is a "sold-out" signal rather than proof
 * that the app exists with a free or unknown price.
 *
 * - `not_sold`: no price in this store region at all (delisted, region-locked, or
 *   removed from the storefront). Kept distinct from a missing checkout link.
 * - `no_price`: the app has no price in the region, but its packages can still be
 *   purchased (e.g. a region store where the app is sold only in bundles). Treated
 *   as an unavailable price, not as "download required".
 * - `not_on_sale_yet`: the app is still marked `coming_soon`, so the absence of a
 *   price is expected and must not be reported as a delisting.
 */
export type UnavailablePriceReason = 'not_sold' | 'no_price' | 'not_on_sale_yet'

export type PriceState =
  | { status: 'priced'; price: NormalizedPrice }
  | { status: 'free' }
  /** The app is listed but has no purchasable price in the store region. */
  | { status: 'unavailable'; reason: UnavailablePriceReason }
  /** Steam returned `price_overview` but its fields could not be parsed. */
  | { status: 'unknown' }

export interface NormalizedApp {
  appid: number
  kind: MonitorKind
  name: string
  isFree: boolean
  release: NormalizedRelease
  price: NormalizedPrice | null
  /**
   * Optional because rows written by older builds have no state. Read it through
   * `withPriceState()` (server/steam/normalize.ts) rather than trusting the field.
   */
  priceState?: PriceState
  dlcIds: number[]
  fullgame: { appid: number; name: string } | null
  headerImage: string | null
  shortDescription: string | null
}

export type AppDetailsResult =
  | {
      status: 'ok'
      app: NormalizedApp
      fetchedAt: number
      fromCache: boolean
      durationMs: number
      httpStatus: number | null
    }
  | {
      status: 'not_found'
      appid: number
      fetchedAt: number
      fromCache: false
      durationMs: number
      httpStatus: number | null
    }

export interface SteamNewsItem {
  gid: string
  title: string
  url: string
  contents: string
  date: number
  feedName: string
}

export type SteamErrorCode =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'forbidden'
  | 'http'
  | 'invalid_json'
  | 'empty_data'
