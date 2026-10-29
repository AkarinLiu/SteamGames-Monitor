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

export interface NormalizedApp {
  appid: number
  kind: MonitorKind
  name: string
  isFree: boolean
  release: NormalizedRelease
  price: NormalizedPrice | null
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
