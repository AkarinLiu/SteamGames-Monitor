import type { CommandExecutionResult } from '../../../shared/types'
import type { Db } from '../database'
import { lastInsertId } from '../database'
import type { InboundMessageRow } from '../rows'

export interface InboundInput {
  platform: string
  platformMessageId: string
  botAppId: number | null
  ownerUserId: number | null
  chatId: string | null
  userId: string | null
  text: string | null
  receivedAt?: number
}

export function insertInboundMessage(
  db: Db,
  input: InboundInput,
): { id: number; inserted: boolean } {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO inbound_messages
        (platform, platform_message_id, bot_app_id, owner_user_id, chat_id, user_id, text, status, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?)`,
    )
    .run(
      input.platform,
      input.platformMessageId,
      input.botAppId,
      input.ownerUserId,
      input.chatId,
      input.userId,
      input.text,
      input.receivedAt ?? Date.now(),
    )
  if (Number(result.changes) > 0) {
    return { id: lastInsertId(result), inserted: true }
  }
  const row = db
    .prepare('SELECT id FROM inbound_messages WHERE platform = ? AND platform_message_id = ?')
    .get(input.platform, input.platformMessageId) as { id: number } | undefined
  return { id: row ? Number(row.id) : 0, inserted: false }
}

export function findInboundMessage(
  db: Db,
  platform: string,
  platformMessageId: string,
): InboundMessageRow | undefined {
  return db
    .prepare(
      'SELECT * FROM inbound_messages WHERE platform = ? AND platform_message_id = ?',
    )
    .get(platform, platformMessageId) as InboundMessageRow | undefined
}

export function finishInboundMessage(
  db: Db,
  id: number,
  status: 'processed' | 'failed' | 'ignored',
  error: string | null,
  replyDeliveryId?: number | null,
): void {
  db.prepare(
    `UPDATE inbound_messages SET status = ?, error = ?, processed_at = ?, reply_delivery_id = ?
     WHERE id = ?`,
  ).run(status, error, Date.now(), replyDeliveryId ?? null, id)
}

export function markInboundProcessing(db: Db, id: number): void {
  db.prepare("UPDATE inbound_messages SET status = 'processing' WHERE id = ?").run(id)
}

export interface CommandLogInput {
  ownerUserId: number | null
  platform: string
  platformUserId: string
  chatId: string | null
  command: string
  args: Record<string, unknown>
  result: CommandExecutionResult['result']
  error?: string | null
  durationMs?: number | null
  createdAt?: number
}

export function writeCommandLog(db: Db, input: CommandLogInput): void {
  db.prepare(
    `INSERT INTO command_logs
      (owner_user_id, platform, platform_user_id, chat_id, command, args_json, result, error, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.ownerUserId,
    input.platform,
    input.platformUserId,
    input.chatId,
    input.command,
    JSON.stringify(input.args ?? {}),
    input.result,
    input.error ?? null,
    input.durationMs ?? null,
    input.createdAt ?? Date.now(),
  )
}

export function purgeInboundMessages(db: Db, before: number, batch = 5000): number {
  const result = db
    .prepare(
      'DELETE FROM inbound_messages WHERE id IN (SELECT id FROM inbound_messages WHERE received_at < ? LIMIT ?)',
    )
    .run(before, batch)
  return Number(result.changes)
}

export function purgeCommandLogs(db: Db, before: number, batch = 5000): number {
  const result = db
    .prepare(
      'DELETE FROM command_logs WHERE id IN (SELECT id FROM command_logs WHERE created_at < ? LIMIT ?)',
    )
    .run(before, batch)
  return Number(result.changes)
}

export interface CommandContextRow {
  bot_app_id: number
  platform: string
  chat_id: string
  platform_user_id: string
  kind: string
  payload_json: string
  created_at: number
  expires_at: number
}

export function setCommandContext(
  db: Db,
  input: {
    botAppId: number
    platform: string
    chatId: string
    platformUserId: string
    kind: string
    payload: Record<string, unknown>
    expiresAt: number
  },
): void {
  db.prepare(
    `INSERT INTO command_contexts
      (bot_app_id, platform, chat_id, platform_user_id, kind, payload_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bot_app_id, platform_user_id, chat_id) DO UPDATE SET
       kind = excluded.kind,
       payload_json = excluded.payload_json,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at`,
  ).run(
    input.botAppId,
    input.platform,
    input.chatId,
    input.platformUserId,
    input.kind,
    JSON.stringify(input.payload),
    Date.now(),
    input.expiresAt,
  )
}

export function getCommandContext(
  db: Db,
  botAppId: number,
  platformUserId: string,
  chatId: string,
  now: number,
): CommandContextRow | undefined {
  return db
    .prepare(
      `SELECT * FROM command_contexts
       WHERE bot_app_id = ? AND platform_user_id = ? AND chat_id = ? AND expires_at > ?`,
    )
    .get(botAppId, platformUserId, chatId, now) as CommandContextRow | undefined
}

export function clearCommandContext(
  db: Db,
  botAppId: number,
  platformUserId: string,
  chatId: string,
): void {
  db.prepare(
    'DELETE FROM command_contexts WHERE bot_app_id = ? AND platform_user_id = ? AND chat_id = ?',
  ).run(botAppId, platformUserId, chatId)
}

export function purgeCommandContexts(db: Db, now: number): number {
  const result = db.prepare('DELETE FROM command_contexts WHERE expires_at <= ?').run(now)
  return Number(result.changes)
}
