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

export function purgeAuditLogs(db: Db, before: number): number {
  const result = db.prepare('DELETE FROM audit_logs WHERE created_at < ?').run(before)
  return Number(result.changes)
}

export function auditDetail(row: AuditLogRow): Record<string, unknown> {
  return safeJsonParse<Record<string, unknown>>(row.detail_json, {})
}
