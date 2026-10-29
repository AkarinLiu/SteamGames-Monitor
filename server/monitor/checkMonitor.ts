import type { EventPayload } from '../../shared/types'
import { EVENT_META } from '../../shared/constants'
import type { Db } from '../db/database'
import { findMonitorByIdInternal, updateMonitor } from '../db/repo/monitors'
import { createSnapshot } from '../db/repo/snapshots'
import { createEvent } from '../db/repo/events'
import { findUserById } from '../db/repo/users'
import type { MonitorRow, UserRow } from '../db/rows'
import { enqueueEventDeliveries } from '../notify/dispatcher'
import { fetchAppDetails } from '../steam/appdetails'
import { SteamRequestError } from '../steam/client'
import type { AppDetailsResult } from '../steam/types'
import { logger } from '../lib/logger'
import type { SteamRateLimiter } from './rateLimiter'
import {
  computeNextCheckAt,
  computeNextNewsCheckAt,
  FAILURE_BUCKETS,
  failureBackoffMs,
  nextCheckAtAfterRateLimit,
} from './policies'
import { deriveMonitorUpdate, monitorRowToState, type DerivedEvent } from './stateMachine'

const log = logger.child('check')

export interface CheckContext {
  db: Db
  limiter: SteamRateLimiter
  now?: () => number
  cacheTtlMs?: number
}

export interface CheckOutcome {
  monitorId: number
  status: 'ok' | 'not_found' | 'error' | 'skipped'
  errorCode?: string
  fromCache?: boolean
  eventsCreated: number
  deliveriesCreated: number
}

export interface CheckOptions {
  force?: boolean
  source?: string
  sharedResult?: AppDetailsResult
}

const locks = new Map<number, Promise<CheckOutcome>>()

export function runMonitorCheck(
  ctx: CheckContext,
  monitorId: number,
  options: CheckOptions = {},
): Promise<CheckOutcome> {
  const existing = locks.get(monitorId)
  if (existing) return existing
  const task = doCheck(ctx, monitorId, options).finally(() => {
    locks.delete(monitorId)
  })
  locks.set(monitorId, task)
  return task
}

async function doCheck(
  ctx: CheckContext,
  monitorId: number,
  options: CheckOptions,
): Promise<CheckOutcome> {
  const db = ctx.db
  const now = (ctx.now ?? Date.now)()
  const monitor = findMonitorByIdInternal(db, monitorId)
  if (!monitor || monitor.deleted_at !== null) {
    return { monitorId, status: 'skipped', eventsCreated: 0, deliveriesCreated: 0 }
  }
  const user = findUserById(db, monitor.user_id)
  if (!user || user.status !== 'active') {
    return { monitorId, status: 'skipped', eventsCreated: 0, deliveriesCreated: 0 }
  }

  let result: AppDetailsResult
  if (options.sharedResult) {
    result = options.sharedResult
  } else {
    try {
      result = await fetchAppDetails(db, monitor.appid, monitor.region, monitor.language, {
        force: options.force,
        limiter: ctx.limiter,
        maxWaitMs: options.force ? 20_000 : 5_000,
        cacheTtlMs: ctx.cacheTtlMs,
      })
    } catch (error) {
      return applyCheckError(ctx, monitor, error, now)
    }
  }

  return applyFetchResult(ctx, monitor, user, result, {
    source: options.source ?? 'steam',
    now,
  })
}

export function applyFetchResult(
  ctx: CheckContext,
  monitor: MonitorRow,
  user: UserRow,
  result: AppDetailsResult,
  options: { source?: string; now?: number } = {},
): CheckOutcome {
  const db = ctx.db
  const now = options.now ?? (ctx.now ?? Date.now)()
  const source = options.source ?? 'steam'
  const threshold = monitor.min_discount_percent ?? user.min_discount_percent
  const baseline = monitor.baseline_pending === 1

  if (result.status === 'not_found') {
    const confirmed = Number(monitor.consecutive_unavailable) >= 1
    const derived = deriveMonitorUpdate({
      monitorId: monitor.id,
      now,
      threshold,
      prev: monitorRowToState(monitor),
      next: null,
      unavailableConfirmed: confirmed,
    })
    const nextCheckAt = computeNextCheckAt(
      {
        consecutiveFailures: 0,
        availability: 'unavailable',
        consecutiveUnavailable: Number(derived.patch.consecutiveUnavailable ?? 1),
        releaseStatus: monitor.release_status,
        discountPercent: 0,
      },
      Number(user.poll_interval_seconds),
      now,
    )
    const nextNewsCheckAt =
      monitor.news_watch === 1
        ? (monitor.next_news_check_at ?? computeNextNewsCheckAt(now))
        : null

    const { eventsCreated, deliveriesCreated } = db.transaction(() => {
      createSnapshot(db, {
        monitorId: monitor.id,
        userId: monitor.user_id,
        checkedAt: now,
        region: monitor.region,
        availability: 'unavailable',
        releaseStatus: monitor.release_status as 'unknown',
        suppressed: baseline,
        httpStatus: result.httpStatus,
        durationMs: result.durationMs,
      })
      updateMonitor(db, monitor.id, {
        ...derived.patch,
        consecutiveFailures: 0,
        lastCheckAt: now,
        lastSuccessAt: now,
        nextCheckAt,
        nextNewsCheckAt,
      })
      return persistEvents(db, monitor, derived.events, source, now)
    })

    return {
      monitorId: monitor.id,
      status: 'not_found',
      fromCache: result.fromCache,
      eventsCreated,
      deliveriesCreated,
    }
  }

  const derived = deriveMonitorUpdate({
    monitorId: monitor.id,
    now,
    threshold,
    prev: monitorRowToState(monitor),
    next: result.app,
    unavailableConfirmed: false,
  })
  const nextCheckAt = computeNextCheckAt(
    {
      consecutiveFailures: 0,
      availability: 'available',
      consecutiveUnavailable: 0,
      releaseStatus: derived.patch.releaseStatus ?? monitor.release_status,
      discountPercent: Number(derived.patch.discountPercent ?? 0),
    },
    Number(user.poll_interval_seconds),
    now,
  )
  const nextNewsCheckAt =
    monitor.news_watch === 1
      ? (monitor.next_news_check_at ?? computeNextNewsCheckAt(now))
      : null

  const app = result.app
  const { eventsCreated, deliveriesCreated } = db.transaction(() => {
    createSnapshot(db, {
      monitorId: monitor.id,
      userId: monitor.user_id,
      checkedAt: now,
      region: monitor.region,
      availability: 'available',
      currency: app.price?.currency ?? null,
      priceInitialRaw: app.price?.initialRaw ?? null,
      priceFinalRaw: app.price?.finalRaw ?? null,
      priceInitialFormatted: app.price?.initialFormatted ?? null,
      priceFinalFormatted: app.price?.finalFormatted ?? null,
      discountPercent: app.price?.discountPercent ?? 0,
      isFree: app.isFree,
      releaseStatus: app.release.comingSoon ? 'coming_soon' : 'released',
      suppressed: baseline,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
    })
    updateMonitor(db, monitor.id, {
      ...derived.patch,
      name: app.name,
      headerImage: app.headerImage ?? monitor.header_image,
      consecutiveFailures: 0,
      lastCheckAt: now,
      lastSuccessAt: now,
      nextCheckAt,
      nextNewsCheckAt,
    })
    return persistEvents(db, monitor, derived.events, source, now)
  })

  return {
    monitorId: monitor.id,
    status: 'ok',
    fromCache: result.fromCache,
    eventsCreated,
    deliveriesCreated,
  }
}

export function applyCheckError(
  ctx: CheckContext,
  monitor: MonitorRow,
  error: unknown,
  now: number,
): CheckOutcome {
  const db = ctx.db
  const requestError =
    error instanceof SteamRequestError
      ? error
      : new SteamRequestError('network', (error as Error)?.message ?? '未知错误')

  if (requestError.code === 'rate_limited') {
    const nextCheckAt = nextCheckAtAfterRateLimit(requestError.retryAfterMs ?? 120_000, now)
    updateMonitor(db, monitor.id, { nextCheckAt })
    log.debug('检查被限流延后', { monitorId: monitor.id, nextCheckAt })
    return {
      monitorId: monitor.id,
      status: 'error',
      errorCode: 'rate_limited',
      eventsCreated: 0,
      deliveriesCreated: 0,
    }
  }

  const failures = Number(monitor.consecutive_failures) + 1
  const autoPaused = requestError.code === 'empty_data' && failures >= 10
  const events: DerivedEvent[] = []
  if (monitor.baseline_pending !== 1 && (FAILURE_BUCKETS as readonly number[]).includes(failures)) {
    events.push({
      type: 'check_error',
      severity: EVENT_META.check_error.severity,
      payload: {
        consecutiveFailures: failures,
        errorCode: requestError.code,
        httpStatus: requestError.httpStatus,
        autoPaused,
      },
      dedupeKey: `check_error:${monitor.id}:${failures}`,
    })
  }

  updateMonitor(db, monitor.id, {
    consecutiveFailures: failures,
    lastCheckAt: now,
    nextCheckAt: now + failureBackoffMs(failures),
    ...(autoPaused ? { enabled: false } : {}),
  })

  db.transaction(() => {
    createSnapshot(db, {
      monitorId: monitor.id,
      userId: monitor.user_id,
      checkedAt: now,
      region: monitor.region,
      availability: 'unknown',
      releaseStatus: 'unknown',
      suppressed: monitor.baseline_pending === 1,
      errorCode: requestError.code,
      httpStatus: requestError.httpStatus,
    })
  })

  let eventsCreated = 0
  let deliveriesCreated = 0
  if (events.length > 0) {
    db.transaction(() => {
      const persisted = persistEvents(db, monitor, events, 'steam', now)
      eventsCreated = persisted.eventsCreated
      deliveriesCreated = persisted.deliveriesCreated
    })
  }

  log.warn('检查失败', {
    monitorId: monitor.id,
    appid: monitor.appid,
    code: requestError.code,
    failures,
    autoPaused,
  })

  return {
    monitorId: monitor.id,
    status: 'error',
    errorCode: requestError.code,
    eventsCreated,
    deliveriesCreated,
  }
}

function enrichPayload(monitor: MonitorRow, event: DerivedEvent, now: number): EventPayload {
  return {
    ...event.payload,
    monitorId: monitor.id,
    appid: monitor.appid,
    name: monitor.name,
    kind: monitor.kind,
    storeUrl: monitor.store_url,
    region: monitor.region,
    checkedAt: now,
  }
}

function persistEvents(
  db: Db,
  monitor: MonitorRow,
  events: DerivedEvent[],
  source: string,
  now: number,
): { eventsCreated: number; deliveriesCreated: number } {
  let eventsCreated = 0
  let deliveriesCreated = 0
  for (const derived of events) {
    const { event, created } = createEvent(db, {
      monitorId: monitor.id,
      userId: monitor.user_id,
      type: derived.type,
      severity: derived.severity,
      payload: enrichPayload(monitor, derived, now),
      dedupeKey: derived.dedupeKey,
      source,
      createdAt: now,
    })
    if (!created) continue
    eventsCreated += 1
    deliveriesCreated += enqueueEventDeliveries(db, event)
  }
  return { eventsCreated, deliveriesCreated }
}
