import type { BotAccessRole, BotPlatform } from '../../../shared/types'
import type { Db } from '../database'
import { affectedRows, lastInsertId } from '../database'

export interface BotAuthRequestRow {
  id: number
  token_hash: string
  bot_app_id: number
  owner_user_id: number
  platform: string
  platform_user_id: string
  platform_user_name: string | null
  chat_id: string | null
  role: string
  status: string
  created_at: number
  expires_at: number
  resolved_at: number | null
  resolved_by_user_id: number | null
}

export interface BotAuthRequestWithBotRow extends BotAuthRequestRow {
  bot_name: string
}

export interface CreateBotAuthRequestInput {
  tokenHash: string
  botAppId: number
  ownerUserId: number
  platform: BotPlatform
  platformUserId: string
  platformUserName: string | null
  chatId: string | null
  role: BotAccessRole
  createdAt: number
  expiresAt: number
}

export function createBotAuthRequest(db: Db, input: CreateBotAuthRequestInput): number {
  const result = db
    .prepare(
      `INSERT INTO bot_auth_requests
        (token_hash, bot_app_id, owner_user_id, platform, platform_user_id,
         platform_user_name, chat_id, role, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.tokenHash,
      input.botAppId,
      input.ownerUserId,
      input.platform,
      input.platformUserId,
      input.platformUserName,
      input.chatId,
      input.role,
      input.createdAt,
      input.expiresAt,
    )
  return lastInsertId(result)
}

export function findBotAuthRequestByTokenHash(
  db: Db,
  tokenHash: string,
): BotAuthRequestWithBotRow | undefined {
  return db
    .prepare(
      `SELECT r.*, b.name AS bot_name
       FROM bot_auth_requests r
       JOIN bot_apps b ON b.id = r.bot_app_id
       WHERE r.token_hash = ?`,
    )
    .get(tokenHash) as BotAuthRequestWithBotRow | undefined
}

export function resolvePendingBotAuthRequests(
  db: Db,
  input: {
    botAppId: number
    platformUserId: string
    status: 'approved' | 'denied'
    role: BotAccessRole
    resolvedAt: number
    resolvedByUserId: number
  },
): number {
  const result = db
    .prepare(
      `UPDATE bot_auth_requests
       SET status = ?, role = ?, resolved_at = ?, resolved_by_user_id = ?
       WHERE bot_app_id = ? AND platform_user_id = ? AND status = 'pending'`,
    )
    .run(
      input.status,
      input.role,
      input.resolvedAt,
      input.resolvedByUserId,
      input.botAppId,
      input.platformUserId,
    )
  return affectedRows(result)
}

export function purgeBotAuthRequests(db: Db, before: number): number {
  const result = db.prepare('DELETE FROM bot_auth_requests WHERE created_at < ?').run(before)
  return Number(result.changes)
}
