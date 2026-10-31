import type { MonitorKind } from '../../../shared/types'
import type { Db } from '../database'
import { affectedRows, lastInsertId } from '../database'
import type { MonitorRow } from '../rows'

export interface CreateMonitorInput {
  userId: number
  appid: number
  kind: MonitorKind
  parentAppid?: number | null
  name: string
  storeUrl: string
  headerImage?: string | null
  region: string
  language: string
  notes?: string | null
  minDiscountPercent?: number | null
  newsWatch?: boolean
  baselinePending?: boolean
  nextCheckAt: number
  nextNewsCheckAt?: number | null
}

export interface MonitorPatch {
  appid?: number
  kind?: MonitorKind
  parentAppid?: number | null
  name?: string
  storeUrl?: string
  headerImage?: string | null
  region?: string
  language?: string
  enabled?: boolean
  notes?: string | null
  minDiscountPercent?: number | null
  newsWatch?: boolean
  baselinePending?: boolean
  availability?: string
  everAvailable?: boolean
  releaseStatus?: string
  releaseDateText?: string | null
  currency?: string | null
  priceInitialRaw?: number | null
  priceFinalRaw?: number | null
  priceInitialFormatted?: string | null
  priceFinalFormatted?: string | null
  discountPercent?: number
  isFree?: boolean
  saleStartedAt?: number | null
  unavailableSince?: number | null
  delistedNotifiedAt?: number | null
  delistingWarningAt?: number | null
  nextCheckAt?: number
  nextNewsCheckAt?: number | null
  lastCheckAt?: number | null
  lastSuccessAt?: number | null
  consecutiveFailures?: number
  consecutiveUnavailable?: number
}

const PATCH_COLUMNS: Record<keyof MonitorPatch, string> = {
  appid: 'appid',
  kind: 'kind',
  parentAppid: 'parent_appid',
  name: 'name',
  storeUrl: 'store_url',
  headerImage: 'header_image',
  region: 'region',
  language: 'language',
  enabled: 'enabled',
  notes: 'notes',
  minDiscountPercent: 'min_discount_percent',
  newsWatch: 'news_watch',
  baselinePending: 'baseline_pending',
  availability: 'availability',
  everAvailable: 'ever_available',
  releaseStatus: 'release_status',
  releaseDateText: 'release_date_text',
  currency: 'currency',
  priceInitialRaw: 'price_initial_raw',
  priceFinalRaw: 'price_final_raw',
  priceInitialFormatted: 'price_initial_formatted',
  priceFinalFormatted: 'price_final_formatted',
  discountPercent: 'discount_percent',
  isFree: 'is_free',
  saleStartedAt: 'sale_started_at',
  unavailableSince: 'unavailable_since',
  delistedNotifiedAt: 'delisted_notified_at',
  delistingWarningAt: 'delisting_warning_at',
  nextCheckAt: 'next_check_at',
  nextNewsCheckAt: 'next_news_check_at',
  lastCheckAt: 'last_check_at',
  lastSuccessAt: 'last_success_at',
  consecutiveFailures: 'consecutive_failures',
  consecutiveUnavailable: 'consecutive_unavailable',
}

const BOOLEAN_KEYS = new Set<keyof MonitorPatch>([
  'enabled',
  'newsWatch',
  'baselinePending',
  'everAvailable',
  'isFree',
])

function toSqlValue(key: keyof MonitorPatch, value: unknown): string | number | null {
  if (BOOLEAN_KEYS.has(key)) return value ? 1 : 0
  return (value as string | number | null) ?? null
}

export function createMonitor(db: Db, input: CreateMonitorInput): MonitorRow {
  const now = Date.now()
  const result = db
    .prepare(
      `INSERT INTO monitors (
        user_id, appid, kind, parent_appid, name, store_url, header_image, region, language,
        enabled, notes, min_discount_percent, news_watch, baseline_pending, next_check_at,
        next_news_check_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.appid,
      input.kind,
      input.parentAppid ?? null,
      input.name,
      input.storeUrl,
      input.headerImage ?? null,
      input.region,
      input.language,
      input.notes ?? null,
      input.minDiscountPercent ?? null,
      input.newsWatch === false ? 0 : 1,
      input.baselinePending === false ? 0 : 1,
      input.nextCheckAt,
      input.nextNewsCheckAt ?? null,
      now,
      now,
    )
  return findMonitorByIdInternal(db, lastInsertId(result)) as MonitorRow
}

export function findMonitorByIdInternal(db: Db, id: number): MonitorRow | undefined {
  return db.prepare('SELECT * FROM monitors WHERE id = ?').get(id) as MonitorRow | undefined
}

export function findMonitorById(
  db: Db,
  userId: number,
  id: number,
  includeDeleted = false,
): MonitorRow | undefined {
  const sql = includeDeleted
    ? 'SELECT * FROM monitors WHERE id = ? AND user_id = ?'
    : 'SELECT * FROM monitors WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
  return db.prepare(sql).get(id, userId) as MonitorRow | undefined
}

export function findMonitorByAppid(
  db: Db,
  userId: number,
  appid: number,
): MonitorRow | undefined {
  return db
    .prepare('SELECT * FROM monitors WHERE user_id = ? AND appid = ?')
    .get(userId, appid) as MonitorRow | undefined
}

export function findMonitorByAppidIncludeDeleted(
  db: Db,
  userId: number,
  appid: number,
): MonitorRow | undefined {
  return findMonitorByAppid(db, userId, appid)
}

export interface MonitorListFilters {
  q?: string
  status?:
    | 'all'
    | 'on_sale'
    | 'paused'
    | 'unavailable'
    | 'coming_soon'
    | 'delisting_soon'
    | 'available'
  page: number
  pageSize: number
  sort?: 'recent' | 'name' | 'last_check' | 'next_check'
}

export function listMonitors(
  db: Db,
  userId: number,
  filters: MonitorListFilters,
): { rows: MonitorRow[]; total: number } {
  const where: string[] = ['user_id = ?', 'deleted_at IS NULL']
  const params: Array<string | number> = [userId]
  if (filters.q) {
    where.push('(name LIKE ? COLLATE NOCASE OR CAST(appid AS TEXT) LIKE ?)')
    const like = `%${filters.q}%`
    params.push(like, like)
  }
  switch (filters.status) {
    case 'on_sale':
      where.push("availability = 'available' AND discount_percent > 0")
      break
    case 'paused':
      where.push('enabled = 0')
      break
    case 'unavailable':
      where.push("availability = 'unavailable'")
      break
    case 'coming_soon':
      where.push("release_status = 'coming_soon'")
      break
    case 'delisting_soon':
      where.push("delisting_warning_at IS NOT NULL AND availability != 'unavailable'")
      break
    case 'available':
      where.push("availability = 'available'")
      break
    default:
      break
  }
  const whereSql = where.join(' AND ')
  const sortSql =
    filters.sort === 'name'
      ? 'name COLLATE NOCASE ASC'
      : filters.sort === 'last_check'
        ? 'COALESCE(last_check_at, 0) DESC'
        : filters.sort === 'next_check'
          ? 'next_check_at ASC'
          : 'created_at DESC'
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM monitors WHERE ${whereSql}`)
    .get(...params) as { n: number }
  const offset = (filters.page - 1) * filters.pageSize
  const rows = db
    .prepare(
      `SELECT * FROM monitors WHERE ${whereSql} ORDER BY ${sortSql} LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, offset) as unknown as MonitorRow[]
  return { rows, total: Number(totalRow.n) }
}

export function listMonitorsForCommand(
  db: Db,
  userId: number,
  options: { saleOnly?: boolean; pausedOnly?: boolean; includePaused?: boolean; limit?: number },
): MonitorRow[] {
  const where = ['user_id = ?', 'deleted_at IS NULL']
  if (options.saleOnly) where.push('discount_percent > 0 AND availability = ?')
  if (options.pausedOnly) where.push('enabled = 0')
  if (options.includePaused === false) where.push('enabled = 1')
  const params: Array<string | number> = [userId]
  if (options.saleOnly) params.push('available')
  params.push(options.limit ?? 10)
  return db
    .prepare(
      `SELECT * FROM monitors WHERE ${where.join(' AND ')}
       ORDER BY discount_percent DESC, created_at DESC LIMIT ?`,
    )
    .all(...params) as unknown as MonitorRow[]
}

export function searchMonitorsByName(
  db: Db,
  userId: number,
  term: string,
  limit = 10,
): MonitorRow[] {
  return db
    .prepare(
      `SELECT * FROM monitors
       WHERE user_id = ? AND deleted_at IS NULL AND (name LIKE ? COLLATE NOCASE OR CAST(appid AS TEXT) LIKE ?)
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, `%${term}%`, `%${term}%`, limit) as unknown as MonitorRow[]
}

export function updateMonitor(db: Db, id: number, patch: MonitorPatch): MonitorRow | undefined {
  const entries = Object.entries(patch) as Array<[keyof MonitorPatch, unknown]>
  const columns: string[] = []
  const values: Array<string | number | null> = []
  for (const [key, value] of entries) {
    if (value === undefined) continue
    const column = PATCH_COLUMNS[key]
    if (!column) continue
    columns.push(`${column} = ?`)
    values.push(toSqlValue(key, value))
  }
  if (columns.length === 0) return findMonitorByIdInternal(db, id)
  values.push(Date.now(), id)
  db.prepare(`UPDATE monitors SET ${columns.join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...values,
  )
  return findMonitorByIdInternal(db, id)
}

export function setMonitorEnabled(db: Db, userId: number, id: number, enabled: boolean): boolean {
  const result = db
    .prepare(
      'UPDATE monitors SET enabled = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    )
    .run(enabled ? 1 : 0, Date.now(), id, userId)
  return affectedRows(result) > 0
}

export function softDeleteMonitor(db: Db, userId: number, id: number): boolean {
  const now = Date.now()
  const result = db
    .prepare(
      `UPDATE monitors SET deleted_at = ?, enabled = 0, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .run(now, now, id, userId)
  return affectedRows(result) > 0
}

export interface RestoreMonitorInput {
  monitorId: number
  name: string
  kind: MonitorKind
  parentAppid: number | null
  storeUrl: string
  headerImage: string | null
  region: string
  language: string
  notes: string | null
  minDiscountPercent: number | null
  newsWatch: boolean
  nextCheckAt: number
  nextNewsCheckAt: number | null
}

export function restoreMonitor(db: Db, input: RestoreMonitorInput): MonitorRow {
  const now = Date.now()
  db.prepare(
    `UPDATE monitors SET
      deleted_at = NULL,
      enabled = 1,
      baseline_pending = 1,
      availability = 'unknown',
      ever_available = 0,
      release_status = 'unknown',
      release_date_text = NULL,
      currency = NULL,
      price_initial_raw = NULL,
      price_final_raw = NULL,
      price_initial_formatted = NULL,
      price_final_formatted = NULL,
      discount_percent = 0,
      is_free = 0,
      sale_started_at = NULL,
      unavailable_since = NULL,
      delisted_notified_at = NULL,
      delisting_warning_at = NULL,
      consecutive_failures = 0,
      consecutive_unavailable = 0,
      name = ?,
      kind = ?,
      parent_appid = ?,
      store_url = ?,
      header_image = ?,
      region = ?,
      language = ?,
      notes = ?,
      min_discount_percent = ?,
      news_watch = ?,
      next_check_at = ?,
      next_news_check_at = ?,
      updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name,
    input.kind,
    input.parentAppid,
    input.storeUrl,
    input.headerImage,
    input.region,
    input.language,
    input.notes,
    input.minDiscountPercent,
    input.newsWatch ? 1 : 0,
    input.nextCheckAt,
    input.nextNewsCheckAt,
    now,
    input.monitorId,
  )
  return findMonitorByIdInternal(db, input.monitorId) as MonitorRow
}

export function resetMonitorsForRegion(db: Db, userId: number, region: string, now: number): number {  const result = db
    .prepare(
      `UPDATE monitors SET
        region = ?,
        baseline_pending = 1,
        availability = 'unknown',
        ever_available = 0,
        release_status = 'unknown',
        release_date_text = NULL,
        currency = NULL,
        price_initial_raw = NULL,
        price_final_raw = NULL,
        price_initial_formatted = NULL,
        price_final_formatted = NULL,
        discount_percent = 0,
        is_free = 0,
        sale_started_at = NULL,
        unavailable_since = NULL,
        delisted_notified_at = NULL,
        delisting_warning_at = NULL,
        consecutive_failures = 0,
        consecutive_unavailable = 0,
        next_check_at = ?,
        next_news_check_at = NULL,
        updated_at = ?
      WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .run(region, now, now, userId)
  return Number(result.changes)
}

export function listDueMonitors(db: Db, now: number, limit: number): MonitorRow[] {
  return db
    .prepare(
      `SELECT m.* FROM monitors m JOIN users u ON u.id = m.user_id
       WHERE u.status = 'active' AND m.enabled = 1 AND m.deleted_at IS NULL AND m.next_check_at <= ?
       ORDER BY m.next_check_at ASC LIMIT ?`,
    )
    .all(now, limit) as unknown as MonitorRow[]
}

export function listDueNewsMonitors(db: Db, now: number, limit: number): MonitorRow[] {
  return db
    .prepare(
      `SELECT m.* FROM monitors m JOIN users u ON u.id = m.user_id
       WHERE u.status = 'active' AND m.enabled = 1 AND m.deleted_at IS NULL AND m.news_watch = 1
         AND m.next_news_check_at IS NOT NULL AND m.next_news_check_at <= ?
       ORDER BY m.next_news_check_at ASC LIMIT ?`,
    )
    .all(now, limit) as unknown as MonitorRow[]
}

export function countDueMonitors(db: Db, now: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM monitors m JOIN users u ON u.id = m.user_id
       WHERE u.status = 'active' AND m.enabled = 1 AND m.deleted_at IS NULL AND m.next_check_at <= ?`,
    )
    .get(now) as { n: number }
  return Number(row.n)
}

export function countDueNewsMonitors(db: Db, now: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM monitors m JOIN users u ON u.id = m.user_id
       WHERE u.status = 'active' AND m.enabled = 1 AND m.deleted_at IS NULL AND m.news_watch = 1
         AND m.next_news_check_at IS NOT NULL AND m.next_news_check_at <= ?`,
    )
    .get(now) as { n: number }
  return Number(row.n)
}

export function countMonitorsForUser(db: Db, userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM monitors WHERE user_id = ? AND deleted_at IS NULL')
    .get(userId) as { n: number }
  return Number(row.n)
}

export function countAllMonitors(db: Db): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM monitors WHERE deleted_at IS NULL')
    .get() as { n: number }
  return Number(row.n)
}

export function countEnabledMonitors(db: Db): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM monitors WHERE deleted_at IS NULL AND enabled = 1')
    .get() as { n: number }
  return Number(row.n)
}

export interface MonitorStats {
  total: number
  available: number
  onSale: number
  unavailable: number
  comingSoon: number
  delistingSoon: number
  paused: number
  lastCheckAt: number | null
}

export function getMonitorStats(db: Db, userId: number): MonitorStats {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN availability = 'available' THEN 1 ELSE 0 END), 0) AS available,
        COALESCE(SUM(CASE WHEN availability = 'available' AND discount_percent > 0 THEN 1 ELSE 0 END), 0) AS on_sale,
        COALESCE(SUM(CASE WHEN availability = 'unavailable' THEN 1 ELSE 0 END), 0) AS unavailable,
        COALESCE(SUM(CASE WHEN release_status = 'coming_soon' THEN 1 ELSE 0 END), 0) AS coming_soon,
        COALESCE(SUM(CASE WHEN delisting_warning_at IS NOT NULL AND availability != 'unavailable' THEN 1 ELSE 0 END), 0) AS delisting_soon,
        COALESCE(SUM(CASE WHEN enabled = 0 THEN 1 ELSE 0 END), 0) AS paused,
        MAX(last_check_at) AS last_check_at
       FROM monitors WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .get(userId) as {
    total: number
    available: number
    on_sale: number
    unavailable: number
    coming_soon: number
    delisting_soon: number
    paused: number
    last_check_at: number | null
  }
  return {
    total: Number(row.total),
    available: Number(row.available),
    onSale: Number(row.on_sale),
    unavailable: Number(row.unavailable),
    comingSoon: Number(row.coming_soon),
    delistingSoon: Number(row.delisting_soon),
    paused: Number(row.paused),
    lastCheckAt: row.last_check_at,
  }
}

export function listRegionLanguageSnapshot(
  db: Db,
  userId: number,
): Array<{ region: string; language: string }> {
  return db
    .prepare(
      `SELECT DISTINCT region, language FROM monitors WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .all(userId) as unknown as Array<{ region: string; language: string }>
}
