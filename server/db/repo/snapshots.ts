import type { Availability, ReleaseStatus, Snapshot } from '../../../shared/types'
import type { Db } from '../database'
import { lastInsertId } from '../database'
import type { SnapshotRow } from '../rows'
import { toSnapshot } from '../rows'

export interface CreateSnapshotInput {
  monitorId: number
  userId: number
  checkedAt: number
  region: string
  availability: Availability
  currency?: string | null
  priceInitialRaw?: number | null
  priceFinalRaw?: number | null
  priceInitialFormatted?: string | null
  priceFinalFormatted?: string | null
  discountPercent?: number
  isFree?: boolean
  releaseStatus?: ReleaseStatus
  suppressed?: boolean
  errorCode?: string | null
  httpStatus?: number | null
  durationMs?: number | null
}

export function createSnapshot(db: Db, input: CreateSnapshotInput): Snapshot {
  const result = db
    .prepare(
      `INSERT INTO snapshots (
        monitor_id, user_id, checked_at, region, availability, currency,
        price_initial_raw, price_final_raw, price_initial_formatted, price_final_formatted,
        discount_percent, is_free, release_status, suppressed, error_code, http_status, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.monitorId,
      input.userId,
      input.checkedAt,
      input.region,
      input.availability,
      input.currency ?? null,
      input.priceInitialRaw ?? null,
      input.priceFinalRaw ?? null,
      input.priceInitialFormatted ?? null,
      input.priceFinalFormatted ?? null,
      input.discountPercent ?? 0,
      input.isFree ? 1 : 0,
      input.releaseStatus ?? 'unknown',
      input.suppressed ? 1 : 0,
      input.errorCode ?? null,
      input.httpStatus ?? null,
      input.durationMs ?? null,
    )
  const row = db
    .prepare('SELECT * FROM snapshots WHERE id = ?')
    .get(lastInsertId(result)) as unknown as SnapshotRow
  return toSnapshot(row)
}

export function listSnapshots(
  db: Db,
  userId: number,
  monitorId: number,
  since: number,
  limit: number,
): Snapshot[] {
  const rows = db
    .prepare(
      `SELECT * FROM snapshots
       WHERE monitor_id = ? AND user_id = ? AND checked_at >= ?
       ORDER BY checked_at DESC LIMIT ?`,
    )
    .all(monitorId, userId, since, limit) as unknown as SnapshotRow[]
  return rows.map(toSnapshot)
}

export function countSnapshots(db: Db, monitorId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM snapshots WHERE monitor_id = ?')
    .get(monitorId) as { n: number }
  return Number(row.n)
}

export function purgeSnapshots(db: Db, before: number, batch = 5000): number {
  const result = db
    .prepare(
      'DELETE FROM snapshots WHERE id IN (SELECT id FROM snapshots WHERE checked_at < ? LIMIT ?)',
    )
    .run(before, batch)
  return Number(result.changes)
}
