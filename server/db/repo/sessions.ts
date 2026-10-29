import type { Db } from '../database'
import type { SessionRow, UserRow } from '../rows'

export interface CreateSessionInput {
  tokenHash: string
  userId: number
  expiresAt: number
  ip?: string | null
  userAgent?: string | null
}

export interface SessionWithUser {
  session: SessionRow
  user: UserRow
}

export function createSession(db: Db, input: CreateSessionInput): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.tokenHash,
    input.userId,
    now,
    input.expiresAt,
    now,
    input.ip ?? null,
    input.userAgent ?? null,
  )
}

export function findSessionWithUser(
  db: Db,
  tokenHash: string,
  now: number,
): SessionWithUser | undefined {
  const row = db
    .prepare(
      `SELECT s.token_hash AS s_token_hash, s.user_id AS s_user_id, s.created_at AS s_created_at,
              s.expires_at AS s_expires_at, s.last_seen_at AS s_last_seen_at, s.ip AS s_ip,
              s.user_agent AS s_user_agent, u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, now) as (UserRow & {
    s_token_hash: string
    s_user_id: number
    s_created_at: number
    s_expires_at: number
    s_last_seen_at: number
    s_ip: string | null
    s_user_agent: string | null
  }) | undefined
  if (!row) return undefined
  const session: SessionRow = {
    token_hash: row.s_token_hash,
    user_id: Number(row.s_user_id),
    created_at: Number(row.s_created_at),
    expires_at: Number(row.s_expires_at),
    last_seen_at: Number(row.s_last_seen_at),
    ip: row.s_ip,
    user_agent: row.s_user_agent,
  }
  return { session, user: row }
}

export function touchSession(db: Db, tokenHash: string, expiresAt: number): void {
  const now = Date.now()
  db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(
    now,
    expiresAt,
    tokenHash,
  )
}

export function deleteSession(db: Db, tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
}

export function deleteUserSessions(db: Db, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function countActiveSessions(db: Db, userId: number, now: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?')
    .get(userId, now) as { n: number }
  return Number(row.n)
}

export function purgeExpiredSessions(db: Db, now: number): number {
  const result = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
  return Number(result.changes)
}
