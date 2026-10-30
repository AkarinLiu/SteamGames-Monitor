import type { BotAccessRole, BotPlatform } from '../../../shared/types'
import type { Db } from '../database'
import { affectedRows, isUniqueViolation, lastInsertId } from '../database'
import type { AllowlistRow, BotAppRow } from '../rows'

export interface CreateBotInput {
  userId: number
  platform: BotPlatform
  name: string
  webhookSlug: string
  enabled: boolean
  notifyEnabled?: boolean
  configEnc: string
  keyVersion: number
  apiBaseUrl?: string | null
}

export interface BotPatch {
  name?: string
  enabled?: boolean
  notifyEnabled?: boolean
  configEnc?: string
  keyVersion?: number
  apiBaseUrl?: string | null
}

export function listBots(db: Db, userId: number): BotAppRow[] {
  return db
    .prepare('SELECT * FROM bot_apps WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId) as unknown as BotAppRow[]
}

export function findBotById(db: Db, userId: number, id: number): BotAppRow | undefined {
  return db.prepare('SELECT * FROM bot_apps WHERE id = ? AND user_id = ?').get(id, userId) as
    | BotAppRow
    | undefined
}

export function findBotByIdInternal(db: Db, id: number): BotAppRow | undefined {
  return db.prepare('SELECT * FROM bot_apps WHERE id = ?').get(id) as BotAppRow | undefined
}

export function findBotBySlug(db: Db, slug: string): BotAppRow | undefined {
  return db.prepare('SELECT * FROM bot_apps WHERE webhook_slug = ?').get(slug) as
    | BotAppRow
    | undefined
}

export function listEnabledBotsByPlatform(db: Db, platform: BotPlatform): BotAppRow[] {
  return db
    .prepare('SELECT * FROM bot_apps WHERE platform = ? AND enabled = 1 ORDER BY id ASC')
    .all(platform) as unknown as BotAppRow[]
}

export function listNotifyingBots(db: Db, userId: number): BotAppRow[] {
  return db
    .prepare(
      'SELECT * FROM bot_apps WHERE user_id = ? AND enabled = 1 AND notify_enabled = 1 ORDER BY created_at ASC',
    )
    .all(userId) as unknown as BotAppRow[]
}

export function touchBotChat(
  db: Db,
  botAppId: number,
  channel: string,
  chatId: string,
  at: number,
): void {
  if (!chatId) return
  db.prepare(
    'UPDATE bot_apps SET last_channel = ?, last_chat_id = ?, last_chat_at = ? WHERE id = ?',
  ).run(channel, chatId, at, botAppId)
}

export function createBot(db: Db, input: CreateBotInput): BotAppRow {
  const now = Date.now()
  const result = db
    .prepare(
      `INSERT INTO bot_apps
        (user_id, platform, name, webhook_slug, enabled, notify_enabled, config_enc, key_version, api_base_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.platform,
      input.name,
      input.webhookSlug,
      input.enabled ? 1 : 0,
      input.notifyEnabled ? 1 : 0,
      input.configEnc,
      input.keyVersion,
      input.apiBaseUrl ?? null,
      now,
      now,
    )
  return findBotByIdInternal(db, lastInsertId(result)) as BotAppRow
}

export function updateBot(db: Db, id: number, patch: BotPatch): BotAppRow | undefined {
  const columns: string[] = []
  const values: Array<string | number | null> = []
  if (patch.name !== undefined) {
    columns.push('name = ?')
    values.push(patch.name)
  }
  if (patch.enabled !== undefined) {
    columns.push('enabled = ?')
    values.push(patch.enabled ? 1 : 0)
  }
  if (patch.notifyEnabled !== undefined) {
    columns.push('notify_enabled = ?')
    values.push(patch.notifyEnabled ? 1 : 0)
  }
  if (patch.configEnc !== undefined) {
    columns.push('config_enc = ?')
    values.push(patch.configEnc)
  }
  if (patch.keyVersion !== undefined) {
    columns.push('key_version = ?')
    values.push(patch.keyVersion)
  }
  if (patch.apiBaseUrl !== undefined) {
    columns.push('api_base_url = ?')
    values.push(patch.apiBaseUrl)
  }
  if (columns.length > 0) {
    values.push(Date.now(), id)
    db.prepare(`UPDATE bot_apps SET ${columns.join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...values,
    )
  }
  return findBotByIdInternal(db, id)
}

export function deleteBot(db: Db, userId: number, id: number): boolean {
  const result = db.prepare('DELETE FROM bot_apps WHERE id = ? AND user_id = ?').run(id, userId)
  return affectedRows(result) > 0
}

export function countBotsForUser(db: Db, userId: number): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM bot_apps WHERE user_id = ?').get(userId) as {
    n: number
  }
  return Number(row.n)
}

export function listAllowlist(db: Db, botAppId: number): AllowlistRow[] {
  return db
    .prepare('SELECT * FROM bot_allowlist WHERE bot_app_id = ? ORDER BY created_at ASC')
    .all(botAppId) as unknown as AllowlistRow[]
}

export function findAllowlistEntry(
  db: Db,
  botAppId: number,
  platformUserId: string,
): AllowlistRow | undefined {
  return db
    .prepare('SELECT * FROM bot_allowlist WHERE bot_app_id = ? AND platform_user_id = ?')
    .get(botAppId, platformUserId) as AllowlistRow | undefined
}

export function upsertAllowlistEntry(
  db: Db,
  botAppId: number,
  platformUserId: string,
  displayName: string | null,
  role: BotAccessRole,
): AllowlistRow {
  db.prepare(
    `INSERT INTO bot_allowlist (bot_app_id, platform_user_id, display_name, role, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(bot_app_id, platform_user_id)
     DO UPDATE SET display_name = excluded.display_name, role = excluded.role`,
  ).run(botAppId, platformUserId, displayName, role, Date.now())
  return findAllowlistEntry(db, botAppId, platformUserId) as AllowlistRow
}

export function deleteAllowlistEntry(
  db: Db,
  botAppId: number,
  platformUserId: string,
): boolean {
  const result = db
    .prepare('DELETE FROM bot_allowlist WHERE bot_app_id = ? AND platform_user_id = ?')
    .run(botAppId, platformUserId)
  return affectedRows(result) > 0
}

export function slugExists(db: Db, slug: string): boolean {
  const row = db.prepare('SELECT 1 AS x FROM bot_apps WHERE webhook_slug = ?').get(slug)
  return Boolean(row)
}

export function isSlugConflict(error: unknown): boolean {
  return isUniqueViolation(error)
}
