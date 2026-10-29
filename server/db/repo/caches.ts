import type { Db } from '../database'

export interface SteamCacheRow {
  appid: number
  region: string
  language: string
  normalized_json: string
  raw_hash: string | null
  fetched_at: number
}

export function getSteamCache(
  db: Db,
  appid: number,
  region: string,
  language: string,
): SteamCacheRow | undefined {
  return db
    .prepare('SELECT * FROM steam_cache WHERE appid = ? AND region = ? AND language = ?')
    .get(appid, region, language) as SteamCacheRow | undefined
}

export function putSteamCache(
  db: Db,
  input: {
    appid: number
    region: string
    language: string
    normalizedJson: string
    rawHash?: string | null
    fetchedAt: number
  },
): void {
  db.prepare(
    `INSERT INTO steam_cache (appid, region, language, normalized_json, raw_hash, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(appid, region, language) DO UPDATE SET
       normalized_json = excluded.normalized_json,
       raw_hash = excluded.raw_hash,
       fetched_at = excluded.fetched_at`,
  ).run(
    input.appid,
    input.region,
    input.language,
    input.normalizedJson,
    input.rawHash ?? null,
    input.fetchedAt,
  )
}

export function countSteamCacheEntries(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM steam_cache').get() as { n: number }
  return Number(row.n)
}

export function purgeSteamCache(db: Db, before: number): number {
  const result = db.prepare('DELETE FROM steam_cache WHERE fetched_at < ?').run(before)
  return Number(result.changes)
}

export interface NewsCacheRow {
  appid: number
  payload_json: string
  fetched_at: number
}

export function getNewsCache(db: Db, appid: number): NewsCacheRow | undefined {
  return db.prepare('SELECT * FROM news_cache WHERE appid = ?').get(appid) as
    | NewsCacheRow
    | undefined
}

export function putNewsCache(
  db: Db,
  input: { appid: number; payloadJson: string; fetchedAt: number },
): void {
  db.prepare(
    `INSERT INTO news_cache (appid, payload_json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(appid) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at`,
  ).run(input.appid, input.payloadJson, input.fetchedAt)
}

export function countNewsCacheEntries(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM news_cache').get() as { n: number }
  return Number(row.n)
}

export function purgeNewsCache(db: Db, before: number): number {
  const result = db.prepare('DELETE FROM news_cache WHERE fetched_at < ?').run(before)
  return Number(result.changes)
}
