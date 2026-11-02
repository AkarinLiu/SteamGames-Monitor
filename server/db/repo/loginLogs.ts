import type { Db } from '../database'

export interface LoginLogEntry {
  userId: number | null
  username: string
  ip: string | null
  userAgent: string | null
  success: boolean
  reason?: string | null
}

export interface LoginLogRow {
  id: number
  user_id: number | null
  username: string
  ip: string | null
  user_agent: string | null
  success: number
  reason: string | null
  created_at: number
}

export function writeLoginLog(db: Db, entry: LoginLogEntry): void {
  db.prepare(
    `INSERT INTO login_logs
       (user_id, username, ip, user_agent, success, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.userId,
    entry.username,
    entry.ip ?? null,
    entry.userAgent ?? null,
    entry.success ? 1 : 0,
    entry.reason ?? null,
    Date.now(),
  )
}

export interface LoginLogFilter {
  userId?: number
  since?: number
  until?: number
  success?: boolean
  offset?: number
  limit?: number
}

export interface LoginLogPage {
  items: LoginLogRow[]
  total: number
  offset: number
  limit: number
}

export function listLoginLogs(db: Db, filter: LoginLogFilter = {}): LoginLogPage {
  const conditions: string[] = []
  const params: Array<string | number | null> = []

  if (filter.userId !== undefined) {
    conditions.push('user_id = ?')
    params.push(filter.userId)
  }
  if (filter.since !== undefined) {
    conditions.push('created_at >= ?')
    params.push(filter.since)
  }
  if (filter.until !== undefined) {
    conditions.push('created_at <= ?')
    params.push(filter.until)
  }
  if (filter.success !== undefined) {
    conditions.push('success = ?')
    params.push(filter.success ? 1 : 0)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM login_logs ${where}`)
    .get(...params) as { n: number }

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
  const offset = Math.max(filter.offset ?? 0, 0)
  const pageParams = [...params, limit, offset]
  const items = db
    .prepare(
      `SELECT * FROM login_logs ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...pageParams) as unknown as LoginLogRow[]

  return { items, total: Number(total.n), offset, limit }
}

export function purgeLoginLogs(db: Db, before: number): number {
  const result = db.prepare('DELETE FROM login_logs WHERE created_at < ?').run(before)
  return Number(result.changes)
}
