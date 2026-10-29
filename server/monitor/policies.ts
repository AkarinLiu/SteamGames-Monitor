import { LIMITS } from '../../shared/constants'
import type { MonitorRow } from '../db/rows'

export const EARLY_RECHECK_MS = 10 * 60_000
export const UNAVAILABLE_RECHECK_MS = 6 * 60 * 60_000
export const COMING_SOON_INTERVAL_MS = 15 * 60_000
export const SALE_INTERVAL_MS = 20 * 60_000
export const NEWS_INTERVAL_MS = 6 * 60 * 60_000
export const MAX_BACKOFF_MS = 6 * 60 * 60_000
export const NEW_MONITOR_DELAY_MS = 5_000
export const FAILURE_BUCKETS = [3, 10, 20, 40] as const

export function jitterMs(value: number, ratio = 0.2, random: () => number = Math.random): number {
  const delta = value * ratio
  return Math.max(0, Math.round(value - delta + random() * delta * 2))
}

export function failureBackoffMs(failures: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, Math.min(failures - 1, 20))
  const base = Math.min(2 ** exponent * 60_000, MAX_BACKOFF_MS)
  return jitterMs(base, 0.2, random)
}

export interface ScheduleState {
  consecutiveFailures: number
  availability: string
  consecutiveUnavailable: number
  releaseStatus: string
  discountPercent: number
}

export function computeNextCheckAt(
  state: ScheduleState,
  userPollSeconds: number,
  now: number,
  random: () => number = Math.random,
): number {
  if (state.consecutiveFailures > 0) {
    return now + failureBackoffMs(state.consecutiveFailures, random)
  }
  if (state.availability === 'unavailable') {
    if (state.consecutiveUnavailable <= 1) {
      return now + EARLY_RECHECK_MS
    }
    return now + jitterMs(UNAVAILABLE_RECHECK_MS, 0.15, random)
  }
  if (state.releaseStatus === 'coming_soon') {
    return now + jitterMs(COMING_SOON_INTERVAL_MS, 0.2, random)
  }
  if (state.discountPercent > 0) {
    return now + jitterMs(SALE_INTERVAL_MS, 0.2, random)
  }
  const pollSeconds = Math.min(
    LIMITS.maxPollIntervalSeconds,
    Math.max(LIMITS.minPollIntervalSeconds, userPollSeconds || LIMITS.defaultPollIntervalSeconds),
  )
  return now + jitterMs(pollSeconds * 1000, 0.2, random)
}

export function computeNextNewsCheckAt(
  now: number,
  random: () => number = Math.random,
): number {
  return now + jitterMs(NEWS_INTERVAL_MS, 0.1, random)
}

export function nextCheckAtAfterRateLimit(retryAfterMs: number, now: number): number {
  return now + Math.max(retryAfterMs, 60_000)
}

export function monitorToScheduleState(row: MonitorRow): ScheduleState {
  return {
    consecutiveFailures: Number(row.consecutive_failures),
    availability: row.availability,
    consecutiveUnavailable: Number(row.consecutive_unavailable),
    releaseStatus: row.release_status,
    discountPercent: Number(row.discount_percent),
  }
}
