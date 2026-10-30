import type {
  BotAccessRole,
  BotAuthRequestInfo,
  BotAuthRequestStatus,
  BotPlatform,
} from '../../shared/types'
import type { Db } from '../db/database'
import { isUniqueViolation } from '../db/database'
import type { BotAppRow, UserRow } from '../db/rows'
import {
  createBotAuthRequest,
  findBotAuthRequestByTokenHash,
  resolvePendingBotAuthRequests,
  type BotAuthRequestWithBotRow,
} from '../db/repo/botAuthRequests'
import { upsertAllowlistEntry } from '../db/repo/bots'
import { env } from '../env'
import { conflict, forbidden, notFound } from '../lib/errors'
import { randomId, sha256Hex } from '../lib/ids'

const AUTH_REQUEST_TTL_MS = 30 * 60_000

export interface CreateBotAuthRequestTarget {
  bot: BotAppRow
  platformUserId: string
  userName?: string | null
  chatId?: string | null
}

export interface BotAuthLink {
  url: string
  expiresAt: number
}

export function createBotAuthorizationRequest(
  db: Db,
  target: CreateBotAuthRequestTarget,
  now = Date.now(),
): BotAuthLink {
  const expiresAt = now + AUTH_REQUEST_TTL_MS
  const platformUserName = target.userName?.trim().slice(0, 100) || null
  const chatId = target.chatId?.trim() || null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomId(24)
    try {
      createBotAuthRequest(db, {
        tokenHash: sha256Hex(token),
        botAppId: target.bot.id,
        ownerUserId: target.bot.user_id,
        platform: target.bot.platform as BotPlatform,
        platformUserId: target.platformUserId,
        platformUserName,
        chatId,
        role: 'viewer',
        createdAt: now,
        expiresAt,
      })
      return { url: `${env.PUBLIC_BASE_URL}/authorize/${token}`, expiresAt }
    } catch (error) {
      if (isUniqueViolation(error)) continue
      throw error
    }
  }
  throw new Error('生成授权链接失败')
}

export function getBotAuthRequestInfo(
  db: Db,
  token: string,
  viewerUserId: number,
  now = Date.now(),
): BotAuthRequestInfo | null {
  const row = findBotAuthRequestByTokenHash(db, sha256Hex(token))
  if (!row) return null
  return toInfo(row, viewerUserId, now)
}

export function approveBotAuthRequest(
  db: Db,
  token: string,
  user: UserRow,
  role: BotAccessRole,
  now = Date.now(),
): BotAuthRequestInfo {
  const row = requireOwnerRequest(db, token, user)
  assertPending(row, now)
  db.transaction(() => {
    const updated = resolvePendingBotAuthRequests(db, {
      botAppId: row.bot_app_id,
      platformUserId: row.platform_user_id,
      status: 'approved',
      role,
      resolvedAt: now,
      resolvedByUserId: user.id,
    })
    if (updated === 0) throw conflict('该授权请求已处理')
    upsertAllowlistEntry(
      db,
      row.bot_app_id,
      row.platform_user_id,
      row.platform_user_name,
      role,
    )
  })
  return toInfo(
    findBotAuthRequestByTokenHash(db, row.token_hash) as BotAuthRequestWithBotRow,
    user.id,
    now,
  )
}

export function denyBotAuthRequest(
  db: Db,
  token: string,
  user: UserRow,
  now = Date.now(),
): BotAuthRequestInfo {
  const row = requireOwnerRequest(db, token, user)
  assertPending(row, now)
  const updated = resolvePendingBotAuthRequests(db, {
    botAppId: row.bot_app_id,
    platformUserId: row.platform_user_id,
    status: 'denied',
    role: row.role as BotAccessRole,
    resolvedAt: now,
    resolvedByUserId: user.id,
  })
  if (updated === 0) throw conflict('该授权请求已处理')
  return toInfo(
    findBotAuthRequestByTokenHash(db, row.token_hash) as BotAuthRequestWithBotRow,
    user.id,
    now,
  )
}

function requireOwnerRequest(
  db: Db,
  token: string,
  user: UserRow,
): BotAuthRequestWithBotRow {
  const row = findBotAuthRequestByTokenHash(db, sha256Hex(token))
  if (!row) throw notFound('授权请求不存在或已失效')
  if (row.owner_user_id !== user.id) {
    throw forbidden('只有机器人所有者可以处理此授权请求')
  }
  return row
}

function assertPending(row: BotAuthRequestWithBotRow, now: number): void {
  if (row.status !== 'pending') throw conflict('该授权请求已处理')
  if (row.expires_at < now) throw conflict('授权链接已过期，请让用户在聊天中重新发送指令')
}

function toInfo(
  row: BotAuthRequestWithBotRow,
  viewerUserId: number,
  now: number,
): BotAuthRequestInfo {
  const expired = row.status === 'pending' && row.expires_at < now
  const status = (expired ? 'expired' : row.status) as BotAuthRequestStatus
  return {
    status,
    canApprove: status === 'pending' && row.owner_user_id === viewerUserId,
    botId: row.bot_app_id,
    botName: row.bot_name,
    platform: row.platform as BotPlatform,
    platformUserId: row.platform_user_id,
    platformUserName: row.platform_user_name,
    chatId: row.chat_id,
    role: status === 'approved' ? (row.role as BotAccessRole) : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}
