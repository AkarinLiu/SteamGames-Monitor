import { LIMITS } from '../../shared/constants'
import type { SteamSearchResult } from '../../shared/types'
import { buildStoreUrl } from '../../shared/utils'
import type { Db } from '../db/database'
import type { MonitorRow, UserRow } from '../db/rows'
import {
  countAllMonitors,
  countMonitorsForUser,
  createMonitor,
  findMonitorByAppid,
  findMonitorByIdInternal,
  restoreMonitor,
} from '../db/repo/monitors'
import { fetchAppDetails } from '../steam/appdetails'
import { SteamRequestError } from '../steam/client'
import { resolveMonitorQuery } from '../steam/resolve'
import type { AppDetailsResult } from '../steam/types'
import type { SteamRateLimiter } from './rateLimiter'
import { applyFetchResult } from './checkMonitor'
import { computeNextNewsCheckAt, NEW_MONITOR_DELAY_MS } from './policies'

export interface AddContext {
  db: Db
  limiter: SteamRateLimiter
  cacheTtlMs?: number
  now?: () => number
  maxTotalMonitors: number
}

export interface AddMonitorInput {
  query: string
  minDiscountPercent?: number | null
  notes?: string | null
  force?: boolean
  newsWatch?: boolean
}

export type AddMonitorOutcome =
  | { status: 'added'; monitor: MonitorRow; eventsCreated: number }
  | { status: 'already_exists'; monitor: MonitorRow }
  | { status: 'selection_required'; query: string; results: SteamSearchResult[] }
  | { status: 'not_available'; appid: number; region: string }
  | { status: 'quota_exceeded'; message: string }
  | { status: 'error'; code: string; message: string }

export type ImportDlcOutcome =
  | { status: 'ok'; created: MonitorRow[]; skipped: number; failed: number }
  | { status: 'selection_required'; query: string; results: SteamSearchResult[] }
  | { status: 'not_available'; appid: number; region: string }
  | { status: 'no_dlc'; appid: number }
  | { status: 'quota_exceeded'; message: string }
  | { status: 'error'; code: string; message: string }

function quotaMessage(ctx: AddContext, user: UserRow): string | null {
  const userLimit = Math.min(Number(user.max_monitors), LIMITS.maxMonitorsPerUser)
  if (countMonitorsForUser(ctx.db, user.id) >= userLimit) {
    return `已达到账号监控项上限（${userLimit}）`
  }
  if (countAllMonitors(ctx.db) >= ctx.maxTotalMonitors) {
    return `已达到系统监控项总上限（${ctx.maxTotalMonitors}）`
  }
  return null
}

function describeSteamError(error: unknown): { code: string; message: string } {
  if (error instanceof SteamRequestError) {
    const messages: Record<string, string> = {
      network: '无法连接 Steam 商店，请稍后重试',
      timeout: 'Steam 商店响应超时，请稍后重试',
      rate_limited: 'Steam 请求受限，请稍后重试',
      forbidden: 'Steam 拒绝访问，请稍后重试',
      http: 'Steam 商店返回异常状态',
      invalid_json: 'Steam 返回了无法解析的数据',
      empty_data: 'Steam 未返回有效的游戏数据',
    }
    return { code: error.code, message: messages[error.code] ?? error.message }
  }
  return { code: 'unknown', message: (error as Error)?.message ?? '未知错误' }
}

export async function addMonitor(
  ctx: AddContext,
  user: UserRow,
  input: AddMonitorInput,
): Promise<AddMonitorOutcome> {
  const db = ctx.db
  const now = (ctx.now ?? Date.now)()
  const region = user.region
  const language = user.language
  if (!region || !language) {
    return { status: 'error', code: 'onboarding_required', message: '请先完成区域与语言设置' }
  }

  let resolved
  try {
    resolved = await resolveMonitorQuery(input.query, region, language, { limiter: ctx.limiter })
  } catch (error) {
    return { status: 'error', ...describeSteamError(error) }
  }
  if (resolved.kind === 'search') {
    if (resolved.results.length === 0) {
      return { status: 'error', code: 'not_found', message: `未找到与「${resolved.query}」匹配的游戏` }
    }
    return { status: 'selection_required', query: resolved.query, results: resolved.results }
  }

  const appid = resolved.appid
  const existing = findMonitorByAppid(db, user.id, appid)
  if (existing && existing.deleted_at === null) {
    return { status: 'already_exists', monitor: existing }
  }

  const quota = quotaMessage(ctx, user)
  if (quota) return { status: 'quota_exceeded', message: quota }

  let fetched: AppDetailsResult
  try {
    fetched = await fetchAppDetails(db, appid, region, language, {
      limiter: ctx.limiter,
      maxWaitMs: 15_000,
      cacheTtlMs: ctx.cacheTtlMs,
    })
  } catch (error) {
    return { status: 'error', ...describeSteamError(error) }
  }

  if (fetched.status === 'not_found' && !input.force) {
    return { status: 'not_available', appid, region }
  }

  const app = fetched.status === 'ok' ? fetched.app : null
  const name = app?.name ?? `App ${appid}`
  const kind = app?.kind ?? 'game'
  const parentAppid = app?.kind === 'dlc' ? (app.fullgame?.appid ?? null) : null
  const storeUrl = buildStoreUrl(appid)
  const headerImage = app?.headerImage ?? null
  const newsWatch = input.newsWatch ?? user.news_enabled === 1
  const nextNewsCheckAt = newsWatch ? computeNextNewsCheckAt(now) : null
  const nextCheckAt = now + NEW_MONITOR_DELAY_MS

  const monitor = existing
    ? restoreMonitor(db, {
        monitorId: existing.id,
        name,
        kind,
        parentAppid,
        storeUrl,
        headerImage,
        region,
        language,
        notes: input.notes ?? existing.notes,
        minDiscountPercent: input.minDiscountPercent ?? existing.min_discount_percent,
        newsWatch,
        nextCheckAt,
        nextNewsCheckAt,
      })
    : createMonitor(db, {
        userId: user.id,
        appid,
        kind,
        parentAppid,
        name,
        storeUrl,
        headerImage,
        region,
        language,
        notes: input.notes ?? null,
        minDiscountPercent: input.minDiscountPercent ?? null,
        newsWatch,
        baselinePending: true,
        nextCheckAt,
        nextNewsCheckAt,
      })

  const outcome = applyFetchResult(
    { db, limiter: ctx.limiter, now: ctx.now, cacheTtlMs: ctx.cacheTtlMs },
    monitor,
    user,
    fetched,
    { source: 'add', now },
  )
  const refreshed = findMonitorByIdInternal(db, monitor.id) as MonitorRow
  return { status: 'added', monitor: refreshed, eventsCreated: outcome.eventsCreated }
}

export async function importDlcMonitors(
  ctx: AddContext,
  user: UserRow,
  query: string,
  max: number = LIMITS.maxDlcImport,
): Promise<ImportDlcOutcome> {
  const db = ctx.db
  const now = (ctx.now ?? Date.now)()
  const region = user.region
  const language = user.language
  if (!region || !language) {
    return { status: 'error', code: 'onboarding_required', message: '请先完成区域与语言设置' }
  }

  let resolved
  try {
    resolved = await resolveMonitorQuery(query, region, language, { limiter: ctx.limiter })
  } catch (error) {
    return { status: 'error', ...describeSteamError(error) }
  }
  if (resolved.kind === 'search') {
    if (resolved.results.length === 0) {
      return { status: 'error', code: 'not_found', message: `未找到与「${resolved.query}」匹配的游戏` }
    }
    return { status: 'selection_required', query: resolved.query, results: resolved.results }
  }

  let base: AppDetailsResult
  try {
    base = await fetchAppDetails(db, resolved.appid, region, language, {
      limiter: ctx.limiter,
      maxWaitMs: 15_000,
      cacheTtlMs: ctx.cacheTtlMs,
    })
  } catch (error) {
    return { status: 'error', ...describeSteamError(error) }
  }
  if (base.status === 'not_found') {
    return { status: 'not_available', appid: resolved.appid, region }
  }
  if (base.app.dlcIds.length === 0) {
    return { status: 'no_dlc', appid: resolved.appid }
  }

  const ids = base.app.dlcIds.slice(0, Math.min(max, LIMITS.maxDlcImport))
  const limit = Math.min(Number(user.max_monitors), LIMITS.maxMonitorsPerUser)
  const existingCount = countMonitorsForUser(db, user.id)
  if (existingCount + ids.length > limit) {
    return {
      status: 'quota_exceeded',
      message: `监控项配额不足：当前 ${existingCount}/${limit}，本次最多可导入 ${Math.max(0, limit - existingCount)} 个 DLC`,
    }
  }
  if (countAllMonitors(db) + ids.length > ctx.maxTotalMonitors) {
    return {
      status: 'quota_exceeded',
      message: `系统监控项总配额不足（上限 ${ctx.maxTotalMonitors}）`,
    }
  }

  const created: MonitorRow[] = []
  let skipped = 0
  let failed = 0
  const newsWatch = user.news_enabled === 1

  for (const dlcId of ids) {
    const existing = findMonitorByAppid(db, user.id, dlcId)
    if (existing && existing.deleted_at === null) {
      skipped += 1
      continue
    }
    let fetched: AppDetailsResult
    try {
      fetched = await fetchAppDetails(db, dlcId, region, language, {
        limiter: ctx.limiter,
        maxWaitMs: 15_000,
        cacheTtlMs: ctx.cacheTtlMs,
      })
    } catch {
      failed += 1
      continue
    }
    if (fetched.status === 'not_found') {
      failed += 1
      continue
    }
    const app = fetched.app
    const monitor = createMonitor(db, {
      userId: user.id,
      appid: dlcId,
      kind: 'dlc',
      parentAppid: resolved.appid,
      name: app.name,
      storeUrl: buildStoreUrl(dlcId),
      headerImage: app.headerImage,
      region,
      language,
      minDiscountPercent: null,
      newsWatch,
      baselinePending: true,
      nextCheckAt: now + NEW_MONITOR_DELAY_MS,
      nextNewsCheckAt: newsWatch ? computeNextNewsCheckAt(now) : null,
    })
    applyFetchResult(
      { db, limiter: ctx.limiter, now: ctx.now, cacheTtlMs: ctx.cacheTtlMs },
      monitor,
      user,
      fetched,
      { source: 'import-dlc', now },
    )
    created.push(findMonitorByIdInternal(db, monitor.id) as MonitorRow)
  }

  return { status: 'ok', created, skipped, failed }
}
