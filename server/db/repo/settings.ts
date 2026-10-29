import type { RetentionSettings, SystemSettings } from '../../../shared/types'
import type { Db } from '../database'
import { safeJsonParse } from '../../../shared/utils'

export const SETTING_KEYS = {
  setupCompleted: 'setup_completed',
  defaultPollIntervalSeconds: 'default_poll_interval_seconds',
  defaultMinDiscountPercent: 'default_min_discount_percent',
  cacheTtlSeconds: 'cache_ttl_seconds',
  newsCacheTtlSeconds: 'news_cache_ttl_seconds',
  retention: 'retention',
} as const

export const DEFAULT_RETENTION: RetentionSettings = {
  snapshotsDays: 90,
  eventsDays: 365,
  deliveriesDays: 14,
  inboundDays: 30,
  logsDays: 180,
  newsSeenDays: 180,
}

export function getSetting<T>(db: Db, key: string, fallback: T): T {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined
  if (!row) return fallback
  return safeJsonParse<T>(row.value_json, fallback)
}

export function setSetting(db: Db, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), Date.now())
}

export function deleteSetting(db: Db, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function getSettingRow(db: Db, key: string): { value_json: string } | undefined {
  return db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined
}

export function isSetupCompleted(db: Db): boolean {
  return getSetting<boolean>(db, SETTING_KEYS.setupCompleted, false) === true
}

export function setSetupCompleted(db: Db, value: boolean): void {
  setSetting(db, SETTING_KEYS.setupCompleted, value)
}

export function getRetention(db: Db): RetentionSettings {
  const stored = getSetting<Partial<RetentionSettings>>(db, SETTING_KEYS.retention, {})
  return { ...DEFAULT_RETENTION, ...stored }
}

export function setRetention(db: Db, value: Partial<RetentionSettings>): RetentionSettings {
  const merged = { ...getRetention(db), ...value }
  setSetting(db, SETTING_KEYS.retention, merged)
  return merged
}

export function getSystemSettings(db: Db, maxTotalMonitors: number): SystemSettings {
  return {
    maxTotalMonitors,
    defaultPollIntervalSeconds: getSetting<number>(
      db,
      SETTING_KEYS.defaultPollIntervalSeconds,
      3600,
    ),
    defaultMinDiscountPercent: getSetting<number>(
      db,
      SETTING_KEYS.defaultMinDiscountPercent,
      20,
    ),
    cacheTtlSeconds: getSetting<number>(db, SETTING_KEYS.cacheTtlSeconds, 600),
    newsCacheTtlSeconds: getSetting<number>(db, SETTING_KEYS.newsCacheTtlSeconds, 6 * 3600),
    retention: getRetention(db),
  }
}
