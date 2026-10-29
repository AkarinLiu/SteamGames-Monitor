import type { AdminUserSummary, PublicUser, Role, UserStatus } from '../../../shared/types'
import { DEFAULT_NEWS_KEYWORDS } from '../../../shared/constants'
import type { Db } from '../database'
import { lastInsertId } from '../database'
import type { UserRow } from '../rows'
import { toPublicUser } from '../rows'

export interface CreateUserInput {
  username: string
  displayName: string
  passwordHash: string
  role: Role
  maxMonitors?: number
  region?: string | null
  language?: string | null
  timezone?: string | null
  mustChangePassword?: boolean
  onboardedAt?: number | null
}

export interface UserPatch {
  displayName?: string
  role?: Role
  status?: UserStatus
  maxMonitors?: number
  region?: string | null
  language?: string | null
  timezone?: string | null
  mustChangePassword?: boolean
  pollIntervalSeconds?: number
  minDiscountPercent?: number
  newsEnabled?: boolean
  newsKeywords?: string[]
  newsMatchMode?: 'title' | 'any'
  onboardedAt?: number | null
}

const PATCH_COLUMNS: Record<keyof UserPatch, string> = {
  displayName: 'display_name',
  role: 'role',
  status: 'status',
  maxMonitors: 'max_monitors',
  region: 'region',
  language: 'language',
  timezone: 'timezone',
  mustChangePassword: 'must_change_password',
  pollIntervalSeconds: 'poll_interval_seconds',
  minDiscountPercent: 'min_discount_percent',
  newsEnabled: 'news_enabled',
  newsKeywords: 'news_keywords_json',
  newsMatchMode: 'news_match_mode',
  onboardedAt: 'onboarded_at',
}

function toSqlValue(key: keyof UserPatch, value: unknown): string | number | null {
  if (key === 'mustChangePassword' || key === 'newsEnabled') return value ? 1 : 0
  if (key === 'newsKeywords') return JSON.stringify(value ?? [])
  return (value as string | number | null) ?? null
}

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function findUserByUsername(db: Db, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as
    | UserRow
    | undefined
}

export function listUserRows(db: Db): UserRow[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as unknown as UserRow[]
}

export function countUsers(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  return Number(row.n)
}

export function countActiveAdmins(db: Db): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")
    .get() as { n: number }
  return Number(row.n)
}

export function createUser(db: Db, input: CreateUserInput): UserRow {
  const now = Date.now()
  const result = db
    .prepare(
      `INSERT INTO users (
        username, display_name, password_hash, role, status, region, language, timezone,
        news_keywords_json, must_change_password, max_monitors, onboarded_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.username,
      input.displayName,
      input.passwordHash,
      input.role,
      input.region ?? null,
      input.language ?? null,
      input.timezone ?? null,
      JSON.stringify(DEFAULT_NEWS_KEYWORDS),
      input.mustChangePassword === false ? 0 : 1,
      input.maxMonitors ?? 200,
      input.onboardedAt ?? null,
      now,
      now,
    )
  const id = lastInsertId(result)
  return findUserById(db, id) as UserRow
}

export function updateUser(db: Db, id: number, patch: UserPatch): UserRow | undefined {
  const entries = Object.entries(patch) as Array<[keyof UserPatch, unknown]>
  if (entries.length === 0) return findUserById(db, id)
  const columns: string[] = []
  const values: Array<string | number | null> = []
  for (const [key, value] of entries) {
    if (value === undefined) continue
    const column = PATCH_COLUMNS[key]
    if (!column) continue
    columns.push(`${column} = ?`)
    values.push(toSqlValue(key, value))
  }
  if (columns.length === 0) return findUserById(db, id)
  values.push(Date.now(), id)
  db.prepare(`UPDATE users SET ${columns.join(', ')}, updated_at = ? WHERE id = ?`).run(...values)
  return findUserById(db, id)
}

export function updatePassword(db: Db, id: number, passwordHash: string): void {
  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
  ).run(passwordHash, Date.now(), id)
}

export function setUserPasswordHash(
  db: Db,
  id: number,
  passwordHash: string,
  mustChangePassword: boolean,
): void {
  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?',
  ).run(passwordHash, mustChangePassword ? 1 : 0, Date.now(), id)
}

export function setMustChangePassword(db: Db, id: number, value: boolean): void {
  db.prepare('UPDATE users SET must_change_password = ?, updated_at = ? WHERE id = ?').run(
    value ? 1 : 0,
    Date.now(),
    id,
  )
}

export function setUserStatus(db: Db, id: number, status: UserStatus): void {
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    Date.now(),
    id,
  )
}

export function touchLastLogin(db: Db, id: number): void {
  const now = Date.now()
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(
    now,
    now,
    id,
  )
}

export function deleteUser(db: Db, id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

export function toAdminSummary(row: UserRow, counts: {
  monitorCount: number
  channelCount: number
  botCount: number
  activeSessions: number
}): AdminUserSummary {
  return {
    ...toPublicUser(row),
    ...counts,
  }
}

export function listAdminSummaries(db: Db, now: number): AdminUserSummary[] {
  const rows = db
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM monitors m WHERE m.user_id = u.id AND m.deleted_at IS NULL) AS monitor_count,
        (SELECT COUNT(*) FROM notification_channels c WHERE c.user_id = u.id) AS channel_count,
        (SELECT COUNT(*) FROM bot_apps b WHERE b.user_id = u.id) AS bot_count,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions
      FROM users u
      ORDER BY u.created_at ASC`,
    )
    .all(now) as unknown as Array<
    UserRow & {
      monitor_count: number
      channel_count: number
      bot_count: number
      active_sessions: number
    }
  >
  return rows.map((row) => {
    const summary: AdminUserSummary = {
      ...toPublicUser(row),
      monitorCount: Number(row.monitor_count),
      channelCount: Number(row.channel_count),
      botCount: Number(row.bot_count),
      activeSessions: Number(row.active_sessions),
    }
    return summary
  })
}

export function publicUser(row: UserRow): PublicUser {
  return toPublicUser(row)
}

export function allUserIds(db: Db): number[] {
  const rows = db.prepare('SELECT id FROM users').all() as unknown as Array<{ id: number }>
  return rows.map((row) => Number(row.id))
}
