import type {
  EventDeliverySummary,
  EventListItem,
  EventPayload,
  EventSeverity,
  EventType,
  MonitorEvent,
} from '../../../shared/types'
import type { Db } from '../database'
import { lastInsertId } from '../database'
import type { EventJoinRow, EventRow } from '../rows'
import { toEvent, toEventListItem } from '../rows'

export interface CreateEventInput {
  monitorId: number
  userId: number
  type: EventType
  severity: EventSeverity
  payload: EventPayload
  dedupeKey: string
  source?: string
  createdAt?: number
}

export function createEvent(
  db: Db,
  input: CreateEventInput,
): { event: MonitorEvent; created: boolean } {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO events (monitor_id, user_id, type, severity, payload_json, dedupe_key, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.monitorId,
      input.userId,
      input.type,
      input.severity,
      JSON.stringify(input.payload),
      input.dedupeKey,
      input.source ?? 'steam',
      input.createdAt ?? Date.now(),
    )
  const inserted = Number(result.changes) > 0
  const row = inserted
    ? (db.prepare('SELECT * FROM events WHERE id = ?').get(lastInsertId(result)) as unknown as EventRow)
    : (db.prepare('SELECT * FROM events WHERE dedupe_key = ?').get(input.dedupeKey) as unknown as EventRow)
  return { event: toEvent(row), created: inserted }
}

export interface EventListFilters {
  type?: EventType
  monitorId?: number
  from?: number
  to?: number
  page: number
  pageSize: number
}

export function listEvents(
  db: Db,
  userId: number,
  filters: EventListFilters,
): { rows: EventListItem[]; total: number } {
  const where: string[] = ['e.user_id = ?']
  const params: Array<string | number> = [userId]
  if (filters.type) {
    where.push('e.type = ?')
    params.push(filters.type)
  }
  if (filters.monitorId) {
    where.push('e.monitor_id = ?')
    params.push(filters.monitorId)
  }
  if (filters.from !== undefined) {
    where.push('e.created_at >= ?')
    params.push(filters.from)
  }
  if (filters.to !== undefined) {
    where.push('e.created_at <= ?')
    params.push(filters.to)
  }
  const whereSql = where.join(' AND ')
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${whereSql}`)
    .get(...params) as { n: number }
  const offset = (filters.page - 1) * filters.pageSize
  const rows = db
    .prepare(
      `SELECT e.*, m.name AS monitor_name, m.appid AS appid, m.kind AS monitor_kind
       FROM events e JOIN monitors m ON m.id = e.monitor_id
       WHERE ${whereSql}
       ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, offset) as unknown as EventJoinRow[]
  return { rows: rows.map(toEventListItem), total: Number(totalRow.n) }
}

export function listRecentEvents(db: Db, userId: number, limit: number): EventListItem[] {
  const rows = db
    .prepare(
      `SELECT e.*, m.name AS monitor_name, m.appid AS appid, m.kind AS monitor_kind
       FROM events e JOIN monitors m ON m.id = e.monitor_id
       WHERE e.user_id = ?
       ORDER BY e.created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as unknown as EventJoinRow[]
  return rows.map(toEventListItem)
}

export function listMonitorEvents(
  db: Db,
  userId: number,
  monitorId: number,
  limit: number,
): EventListItem[] {
  const rows = db
    .prepare(
      `SELECT e.*, m.name AS monitor_name, m.appid AS appid, m.kind AS monitor_kind
       FROM events e JOIN monitors m ON m.id = e.monitor_id
       WHERE e.user_id = ? AND e.monitor_id = ?
       ORDER BY e.created_at DESC LIMIT ?`,
    )
    .all(userId, monitorId, limit) as unknown as EventJoinRow[]
  return rows.map(toEventListItem)
}

export function countEventsSince(db: Db, userId: number, since: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND created_at >= ?')
    .get(userId, since) as { n: number }
  return Number(row.n)
}

export function countEventsForMonitor(db: Db, monitorId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM events WHERE monitor_id = ?')
    .get(monitorId) as { n: number }
  return Number(row.n)
}

export function findEventById(db: Db, userId: number, id: number): MonitorEvent | undefined {
  const row = db
    .prepare('SELECT * FROM events WHERE id = ? AND user_id = ?')
    .get(id, userId) as EventRow | undefined
  return row ? toEvent(row) : undefined
}

export function deliverySummaries(
  db: Db,
  eventIds: number[],
): Map<number, EventDeliverySummary> {
  const map = new Map<number, EventDeliverySummary>()
  if (eventIds.length === 0) return map
  const placeholders = eventIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT event_id,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status IN ('pending', 'sending') THEN 1 ELSE 0 END) AS pending
       FROM deliveries
       WHERE kind = 'event' AND event_id IN (${placeholders})
       GROUP BY event_id`,
    )
    .all(...eventIds) as unknown as Array<{
    event_id: number
    total: number
    sent: number
    failed: number
    pending: number
  }>
  for (const row of rows) {
    map.set(Number(row.event_id), {
      total: Number(row.total),
      sent: Number(row.sent),
      failed: Number(row.failed),
      pending: Number(row.pending),
    })
  }
  return map
}

export function purgeEvents(db: Db, before: number, batch = 5000): number {
  const result = db
    .prepare(
      'DELETE FROM events WHERE id IN (SELECT id FROM events WHERE created_at < ? LIMIT ?)',
    )
    .run(before, batch)
  return Number(result.changes)
}
