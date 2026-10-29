import type { Db } from '../database'
import type { NewsSeenRow } from '../rows'

export interface RecordNewsSeenInput {
  monitorId: number
  gid: string
  title: string
  url: string
  publishedAt?: number | null
  matchedKeyword?: string | null
  eventId?: number | null
  seenAt?: number
}

export function hasSeenNews(db: Db, monitorId: number, gid: string): boolean {
  return Boolean(
    db
      .prepare('SELECT 1 AS x FROM news_seen WHERE monitor_id = ? AND gid = ?')
      .get(monitorId, gid),
  )
}

export function recordNewsSeen(db: Db, input: RecordNewsSeenInput): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO news_seen
        (monitor_id, gid, title, url, published_at, matched_keyword, event_id, seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.monitorId,
      input.gid,
      input.title,
      input.url,
      input.publishedAt ?? null,
      input.matchedKeyword ?? null,
      input.eventId ?? null,
      input.seenAt ?? Date.now(),
    )
  return Number(result.changes) > 0
}

export function listNewsSeen(db: Db, monitorId: number, limit = 50): NewsSeenRow[] {
  return db
    .prepare('SELECT * FROM news_seen WHERE monitor_id = ? ORDER BY seen_at DESC LIMIT ?')
    .all(monitorId, limit) as unknown as NewsSeenRow[]
}

export function attachNewsEvent(db: Db, monitorId: number, gid: string, eventId: number): void {
  db.prepare('UPDATE news_seen SET event_id = ? WHERE monitor_id = ? AND gid = ?').run(
    eventId,
    monitorId,
    gid,
  )
}

export function purgeNewsSeen(db: Db, before: number, batch = 5000): number {
  const result = db
    .prepare(
      'DELETE FROM news_seen WHERE id IN (SELECT id FROM news_seen WHERE seen_at < ? LIMIT ?)',
    )
    .run(before, batch)
  return Number(result.changes)
}
