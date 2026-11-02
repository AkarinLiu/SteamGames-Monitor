import type { Db } from '../database'
import { lastInsertId } from '../database'
import { safeJsonParse } from '../../../shared/utils'

export interface AuditEntry {
  actorUserId: number | null
  action: string
  target?: string | null
  detail?: Record<string, unknown>
  ip?: string | null
}

export function writeAudit(db: Db, entry: AuditEntry): number {
  const result = db
    .prepare(
      `INSERT INTO audit_logs (actor_user_id, action, target, detail_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.actorUserId,
      entry.action,
      entry.target ?? null,
      JSON.stringify(entry.detail ?? {}),
      entry.ip ?? null,
      Date.now(),
    )
  return lastInsertId(result)
}

export interface AuditLogRow {
  id: number
  actor_user_id: number | null
  action: string
  target: string | null
  detail_json: string
  ip: string | null
  created_at: number
}

export function listAuditLogs(db: Db, limit = 100): AuditLogRow[] {
  return db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as AuditLogRow[]
}

export interface AuditLogFilter {
  actorUserId?: number | null
  actions?: string[]
  target?: string | null
  since?: number
  until?: number
  offset?: number
  limit?: number
}

export interface AuditLogPage {
  items: AuditLogRow[]
  total: number
  offset: number
  limit: number
}

export function listAuditLogsFiltered(db: Db, filter: AuditLogFilter = {}): AuditLogPage {
  const conditions: string[] = []
  const params: Array<string | number | null> = []

  if (filter.actorUserId !== undefined && filter.actorUserId !== null) {
    conditions.push('actor_user_id = ?')
    params.push(filter.actorUserId)
  }
  if (filter.actions && filter.actions.length > 0) {
    conditions.push(`action IN (${filter.actions.map(() => '?').join(',')})`)
    for (const action of filter.actions) params.push(action)
  }
  if (filter.target !== undefined && filter.target !== null) {
    if (filter.target.endsWith('*')) {
      conditions.push('target LIKE ?')
      params.push(filter.target.slice(0, -1) + '%')
    } else {
      conditions.push('target = ?')
      params.push(filter.target)
    }
  }
  if (filter.since !== undefined) {
    conditions.push('created_at >= ?')
    params.push(filter.since)
  }
  if (filter.until !== undefined) {
    conditions.push('created_at <= ?')
    params.push(filter.until)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM audit_logs ${where}`)
    .get(...params) as { n: number }

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
  const offset = Math.max(filter.offset ?? 0, 0)
  const pageParams = [...params, limit, offset]
  const items = db
    .prepare(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...pageParams) as unknown as AuditLogRow[]

  return { items, total: Number(total.n), offset, limit }
}

export function distinctAuditActions(db: Db): string[] {
  const rows = db
    .prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC')
    .all() as Array<{ action: string }>
  return rows.map((row) => row.action)
}

export function distinctAuditActors(db: Db): Array<{ id: number; username: string; displayName: string }> {
  const rows = db
    .prepare(
      `SELECT DISTINCT u.id, u.username, u.display_name
       FROM audit_logs a
       JOIN users u ON u.id = a.actor_user_id
       WHERE a.actor_user_id IS NOT NULL
       ORDER BY u.display_name ASC`,
    )
    .all() as Array<{ id: number; username: string; display_name: string }>
  return rows.map((row) => ({
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
  }))
}

export function purgeAuditLogs(db: Db, before: number): number {
  const result = db.prepare('DELETE FROM audit_logs WHERE created_at < ?').run(before)
  return Number(result.changes)
}

export function auditDetail(row: AuditLogRow): Record<string, unknown> {
  return safeJsonParse<Record<string, unknown>>(row.detail_json, {})
}
