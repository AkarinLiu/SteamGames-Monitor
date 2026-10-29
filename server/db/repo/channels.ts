import type { ChannelType, EventType } from '../../../shared/types'
import type { Db } from '../database'
import { affectedRows, lastInsertId } from '../database'
import type { ChannelRow } from '../rows'

export interface CreateChannelInput {
  userId: number
  name: string
  type: ChannelType
  enabled: boolean
  eventTypes: EventType[]
  configEnc: string
  keyVersion: number
}

export interface ChannelPatch {
  name?: string
  enabled?: boolean
  eventTypes?: EventType[]
  configEnc?: string
  keyVersion?: number
}

export function listChannels(db: Db, userId: number): ChannelRow[] {
  return db
    .prepare('SELECT * FROM notification_channels WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId) as unknown as ChannelRow[]
}

export function listEnabledChannels(db: Db, userId: number): ChannelRow[] {
  return db
    .prepare(
      'SELECT * FROM notification_channels WHERE user_id = ? AND enabled = 1 ORDER BY created_at ASC',
    )
    .all(userId) as unknown as ChannelRow[]
}

export function findChannel(db: Db, userId: number, id: number): ChannelRow | undefined {
  return db
    .prepare('SELECT * FROM notification_channels WHERE id = ? AND user_id = ?')
    .get(id, userId) as ChannelRow | undefined
}

export function findChannelById(db: Db, id: number): ChannelRow | undefined {
  return db.prepare('SELECT * FROM notification_channels WHERE id = ?').get(id) as
    | ChannelRow
    | undefined
}

export function createChannel(db: Db, input: CreateChannelInput): ChannelRow {
  const now = Date.now()
  const result = db
    .prepare(
      `INSERT INTO notification_channels
        (user_id, name, type, enabled, event_types_json, config_enc, key_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.name,
      input.type,
      input.enabled ? 1 : 0,
      JSON.stringify(input.eventTypes),
      input.configEnc,
      input.keyVersion,
      now,
      now,
    )
  return findChannelById(db, lastInsertId(result)) as ChannelRow
}

export function updateChannel(db: Db, id: number, patch: ChannelPatch): ChannelRow | undefined {
  const columns: string[] = []
  const values: Array<string | number> = []
  if (patch.name !== undefined) {
    columns.push('name = ?')
    values.push(patch.name)
  }
  if (patch.enabled !== undefined) {
    columns.push('enabled = ?')
    values.push(patch.enabled ? 1 : 0)
  }
  if (patch.eventTypes !== undefined) {
    columns.push('event_types_json = ?')
    values.push(JSON.stringify(patch.eventTypes))
  }
  if (patch.configEnc !== undefined) {
    columns.push('config_enc = ?')
    values.push(patch.configEnc)
  }
  if (patch.keyVersion !== undefined) {
    columns.push('key_version = ?')
    values.push(patch.keyVersion)
  }
  if (columns.length > 0) {
    values.push(Date.now(), id)
    db.prepare(
      `UPDATE notification_channels SET ${columns.join(', ')}, updated_at = ? WHERE id = ?`,
    ).run(...values)
  }
  return findChannelById(db, id)
}

export function deleteChannel(db: Db, userId: number, id: number): boolean {
  const result = db
    .prepare('DELETE FROM notification_channels WHERE id = ? AND user_id = ?')
    .run(id, userId)
  return affectedRows(result) > 0
}

export function updateChannelTestResult(
  db: Db,
  id: number,
  ok: boolean,
  error: string | null,
): void {
  db.prepare(
    'UPDATE notification_channels SET last_test_at = ?, last_test_ok = ?, last_test_error = ? WHERE id = ?',
  ).run(Date.now(), ok ? 1 : 0, error, id)
}

export function countChannelsForUser(db: Db, userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM notification_channels WHERE user_id = ?')
    .get(userId) as { n: number }
  return Number(row.n)
}
