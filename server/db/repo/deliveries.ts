import type { Delivery, DeliveryKind } from '../../../shared/types'
import type { Db } from '../database'
import { affectedRows, lastInsertId } from '../database'
import type { DeliveryRow } from '../rows'
import { toDelivery } from '../rows'

export interface CreateDeliveryInput {
  userId: number
  kind: DeliveryKind
  eventId?: number | null
  channelId?: number | null
  botAppId?: number | null
  target?: Record<string, unknown>
  payload: Record<string, unknown>
  maxAttempts?: number
  nextAttemptAt?: number | null
  createdAt?: number
}

export function createDelivery(db: Db, input: CreateDeliveryInput): Delivery {
  const now = input.createdAt ?? Date.now()
  const result = db
    .prepare(
      `INSERT INTO deliveries
        (user_id, kind, event_id, channel_id, bot_app_id, target_json, payload_json, status,
         attempts, max_attempts, next_attempt_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.kind,
      input.eventId ?? null,
      input.channelId ?? null,
      input.botAppId ?? null,
      JSON.stringify(input.target ?? {}),
      JSON.stringify(input.payload),
      input.maxAttempts ?? 6,
      input.nextAttemptAt ?? now,
      now,
    )
  return toDelivery(findDeliveryRow(db, lastInsertId(result)) as DeliveryRow)
}

export function createEventDelivery(
  db: Db,
  input: Omit<CreateDeliveryInput, 'kind'> & {
    eventId: number
    channelId?: number | null
    botAppId?: number | null
  },
): Delivery | null {
  const now = input.createdAt ?? Date.now()
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO deliveries
        (user_id, kind, event_id, channel_id, bot_app_id, target_json, payload_json, status,
         attempts, max_attempts, next_attempt_at, created_at)
       VALUES (?, 'event', ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.eventId,
      input.channelId ?? null,
      input.botAppId ?? null,
      JSON.stringify(input.target ?? {}),
      JSON.stringify(input.payload),
      input.maxAttempts ?? 6,
      input.nextAttemptAt ?? now,
      now,
    )
  if (Number(result.changes) === 0) return null
  return toDelivery(findDeliveryRow(db, lastInsertId(result)) as DeliveryRow)
}

export function findDeliveryRow(db: Db, id: number): DeliveryRow | undefined {
  return db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) as DeliveryRow | undefined
}

export function findDelivery(db: Db, userId: number, id: number): Delivery | undefined {
  const row = db
    .prepare('SELECT * FROM deliveries WHERE id = ? AND user_id = ?')
    .get(id, userId) as DeliveryRow | undefined
  return row ? toDelivery(row) : undefined
}

export function listDeliveriesForEvent(db: Db, eventId: number): DeliveryRow[] {
  return db
    .prepare('SELECT * FROM deliveries WHERE event_id = ? ORDER BY created_at ASC')
    .all(eventId) as unknown as DeliveryRow[]
}

export function hasDeliveriesForEvent(db: Db, eventId: number): boolean {
  return Boolean(db.prepare('SELECT 1 FROM deliveries WHERE event_id = ? LIMIT 1').get(eventId))
}

export function listEventDeliveryViews(
  db: Db,
  userId: number,
  eventId: number,
): Delivery[] {
  const rows = db
    .prepare(
      'SELECT * FROM deliveries WHERE user_id = ? AND event_id = ? ORDER BY created_at ASC',
    )
    .all(userId, eventId) as unknown as DeliveryRow[]
  return rows.map(toDelivery)
}

export function claimDueDeliveries(db: Db, now: number, limit: number): DeliveryRow[] {
  return db.transaction(() => {
    const candidates = db
      .prepare(
        `SELECT d.* FROM deliveries d
         WHERE d.status = 'pending'
           AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?)
           AND (d.locked_until IS NULL OR d.locked_until <= ?)
           AND (
             d.channel_id IS NULL OR (
               NOT EXISTS (
                 SELECT 1 FROM deliveries x
                 WHERE x.channel_id = d.channel_id AND x.status = 'sending'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM deliveries y
                 WHERE y.channel_id = d.channel_id
                   AND y.status IN ('pending', 'sending')
                   AND y.id < d.id
               )
             )
           )
         ORDER BY COALESCE(d.next_attempt_at, d.created_at) ASC
         LIMIT ?`,
      )
      .all(now, now, limit) as unknown as DeliveryRow[]
    const claimed: DeliveryRow[] = []
    for (const row of candidates) {
      const result = db
        .prepare(
          `UPDATE deliveries
           SET status = 'sending', attempts = attempts + 1, locked_until = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(now + 120_000, row.id)
      if (affectedRows(result) > 0) {
        const updated = findDeliveryRow(db, row.id)
        if (updated) claimed.push(updated)
      }
    }
    return claimed
  })
}

export function markDeliverySent(db: Db, id: number, httpStatus: number | null): void {
  db.prepare(
    `UPDATE deliveries
     SET status = 'sent', sent_at = ?, locked_until = NULL, last_error = NULL, last_http_status = ?
     WHERE id = ?`,
  ).run(Date.now(), httpStatus, id)
}

export function markDeliveryFailed(
  db: Db,
  id: number,
  options: {
    error: string
    httpStatus?: number | null
    retryAt?: number | null
    permanent?: boolean
  },
): 'pending' | 'failed' {
  const row = findDeliveryRow(db, id)
  if (!row) return 'failed'
  const attempts = Number(row.attempts)
  const maxAttempts = Number(row.max_attempts)
  const exhausted = attempts >= maxAttempts || options.permanent === true
  if (exhausted) {
    db.prepare(
      `UPDATE deliveries
       SET status = 'failed', locked_until = NULL, last_error = ?, last_http_status = ?
       WHERE id = ?`,
    ).run(options.error, options.httpStatus ?? null, id)
    return 'failed'
  }
  db.prepare(
    `UPDATE deliveries
     SET status = 'pending', locked_until = NULL, next_attempt_at = ?,
         last_error = ?, last_http_status = ?
     WHERE id = ?`,
  ).run(options.retryAt ?? Date.now() + 30_000, options.error, options.httpStatus ?? null, id)
  return 'pending'
}

export function cancelDelivery(db: Db, id: number, reason = 'canceled'): void {
  db.prepare(
    `UPDATE deliveries SET status = 'canceled', locked_until = NULL, last_error = ? WHERE id = ?`,
  ).run(reason, id)
}

export function cancelPendingForChannel(db: Db, channelId: number): number {
  const result = db
    .prepare(
      `UPDATE deliveries SET status = 'canceled', locked_until = NULL, last_error = 'channel disabled or deleted'
       WHERE channel_id = ? AND status IN ('pending', 'sending')`,
    )
    .run(channelId)
  return Number(result.changes)
}

export function cancelPendingForBot(db: Db, botAppId: number): number {
  const result = db
    .prepare(
      `UPDATE deliveries SET status = 'canceled', locked_until = NULL, last_error = 'bot disabled, notification off or deleted'
       WHERE bot_app_id = ? AND status IN ('pending', 'sending')`,
    )
    .run(botAppId)
  return Number(result.changes)
}

export function requeueStuckDeliveries(db: Db, now: number): number {
  const result = db
    .prepare(
      `UPDATE deliveries SET status = 'pending', locked_until = NULL, next_attempt_at = ?
       WHERE status = 'sending' AND (locked_until IS NULL OR locked_until <= ?)`,
    )
    .run(now, now)
  return Number(result.changes)
}

export function resetDeliveryForRetry(db: Db, userId: number, id: number): boolean {
  const result = db
    .prepare(
      `UPDATE deliveries
       SET status = 'pending', attempts = 0, next_attempt_at = ?, locked_until = NULL, last_error = NULL
       WHERE id = ? AND user_id = ? AND status IN ('failed', 'canceled', 'sent')`,
    )
    .run(Date.now(), id, userId)
  return affectedRows(result) > 0
}

export function resetFailedEventDeliveries(db: Db, userId: number, eventId: number): number {
  const result = db
    .prepare(
      `UPDATE deliveries
       SET status = 'pending', attempts = 0, next_attempt_at = ?, locked_until = NULL, last_error = NULL
       WHERE user_id = ? AND event_id = ? AND status IN ('failed', 'canceled')`,
    )
    .run(Date.now(), userId, eventId)
  return Number(result.changes)
}

export interface QueueStats {
  pending: number
  sending: number
  failed24h: number
  oldestPendingAt: number | null
}

export function getQueueStats(db: Db, now: number): QueueStats {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'sending' THEN 1 ELSE 0 END), 0) AS sending,
        COALESCE(SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END), 0) AS failed_24h,
        MIN(CASE WHEN status = 'pending' THEN COALESCE(next_attempt_at, created_at) END) AS oldest_pending
       FROM deliveries`,
    )
    .get(now - 24 * 60 * 60 * 1000) as {
    pending: number
    sending: number
    failed_24h: number
    oldest_pending: number | null
  }
  return {
    pending: Number(row.pending),
    sending: Number(row.sending),
    failed24h: Number(row.failed_24h),
    oldestPendingAt: row.oldest_pending,
  }
}

export function countFailedDeliveries(db: Db, userId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM deliveries WHERE user_id = ? AND status = 'failed'`,
    )
    .get(userId) as { n: number }
  return Number(row.n)
}

export function countPendingDeliveries(db: Db, userId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM deliveries WHERE user_id = ? AND status IN ('pending', 'sending')`,
    )
    .get(userId) as { n: number }
  return Number(row.n)
}

export function purgeTerminalDeliveries(db: Db, before: number, batch = 5000): number {
  const result = db
    .prepare(
      `DELETE FROM deliveries WHERE id IN (
        SELECT id FROM deliveries
        WHERE status IN ('sent', 'failed', 'canceled')
          AND COALESCE(sent_at, created_at) < ?
        LIMIT ?
      )`,
    )
    .run(before, batch)
  return Number(result.changes)
}
