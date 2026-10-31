import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase, runMigrations, type Db } from './database'
import { migrations } from './migrations'
import { countActiveAdmins, createUser, findUserByUsername, updateUser } from './repo/users'
import { createSession, findSessionWithUser } from './repo/sessions'
import { createMonitor, findMonitorByAppid, listMonitors } from './repo/monitors'
import { createEvent } from './repo/events'
import { claimDueDeliveries, createDelivery, markDeliverySent } from './repo/deliveries'
import { getSetting, setSetting, getRetention } from './repo/settings'

let db: Db

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

function makeUser(username = 'admin') {
  return createUser(db, {
    username,
    displayName: username,
    passwordHash: 'scrypt$test',
    role: username === 'admin' ? 'admin' : 'member',
  })
}

describe('database schema', () => {
  it('creates all tables', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)
    for (const table of [
      'users',
      'sessions',
      'monitors',
      'snapshots',
      'events',
      'deliveries',
      'notification_channels',
      'bot_apps',
      'bot_allowlist',
      'bot_auth_requests',
      'command_contexts',
      'inbound_messages',
      'command_logs',
      'news_seen',
      'steam_cache',
      'news_cache',
      'settings',
      'audit_logs',
      'schema_migrations',
    ]) {
      expect(names).toContain(table)
    }
  })

  it('backfills the delisting warning status from existing warning events', () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
    )
    raw.exec('PRAGMA foreign_keys = ON')
    for (const migration of migrations.filter((item) => item.version <= 6)) {
      migration.up(raw)
      raw
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, Date.now())
    }
    raw.exec(`
      INSERT INTO users (username, display_name, password_hash, created_at, updated_at)
      VALUES ('backfill', 'Backfill', 'scrypt$test', 1, 1);

      INSERT INTO monitors
        (user_id, appid, kind, name, store_url, region, language, next_check_at, created_at, updated_at)
      VALUES
        (1, 1, 'game', 'Still Warned', 'https://store.steampowered.com/app/1/', 'cn', 'schinese', 1, 1, 1),
        (1, 2, 'game', 'Already Restored', 'https://store.steampowered.com/app/2/', 'cn', 'schinese', 1, 1, 1);

      INSERT INTO events
        (monitor_id, user_id, type, severity, payload_json, dedupe_key, source, created_at)
      VALUES
        (1, 1, 'delisting_warning', 'warning', '{}', 'warn-1', 'steam', 2000),
        (1, 1, 'restored', 'info', '{}', 'restored-1', 'steam', 1000),
        (2, 1, 'delisting_warning', 'warning', '{}', 'warn-2', 'steam', 2000),
        (2, 1, 'restored', 'info', '{}', 'restored-2', 'steam', 3000);
    `)

    runMigrations(raw)
    const rows = raw
      .prepare('SELECT id, delisting_warning_at FROM monitors ORDER BY id')
      .all() as Array<{ id: number; delisting_warning_at: number | null }>
    expect(rows).toEqual([
      { id: 1, delisting_warning_at: 2000 },
      { id: 2, delisting_warning_at: null },
    ])
    raw.close()
  })

  it('preserves events and their references when adding release_date', () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
    )
    raw.exec('PRAGMA foreign_keys = ON')
    for (const migration of migrations.filter((item) => item.version <= 8)) {
      migration.up(raw)
      raw
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, Date.now())
    }
    raw.exec(`
      INSERT INTO users (username, display_name, password_hash, created_at, updated_at)
      VALUES ('events', 'Events', 'scrypt$test', 1, 1);

      INSERT INTO monitors
        (user_id, appid, kind, name, store_url, region, language, next_check_at, created_at, updated_at)
      VALUES
        (1, 300, 'game', 'Event Game', 'https://store.steampowered.com/app/300/', 'cn', 'schinese', 1, 1, 1);

      INSERT INTO events
        (id, monitor_id, user_id, type, severity, payload_json, dedupe_key, source, created_at)
      VALUES
        (1, 1, 1, 'sale_start', 'info', '{"discountPercent":50}', 'sale-start-1', 'steam', 100);

      INSERT INTO deliveries
        (user_id, kind, event_id, target_json, payload_json, created_at)
      VALUES
        (1, 'event', 1, '{}', '{"eventId":1}', 100);

      INSERT INTO news_seen
        (monitor_id, gid, title, url, event_id, seen_at)
      VALUES
        (1, 'gid-1', 'News', 'https://example.com/news', 1, 100);
    `)

    runMigrations(raw)
    const event = raw.prepare('SELECT id, type FROM events').get() as {
      id: number
      type: string
    }
    expect(event).toEqual({ id: 1, type: 'sale_start' })
    expect(
      (raw.prepare('SELECT COUNT(*) AS n FROM deliveries').get() as { n: number }).n,
    ).toBe(1)
    expect(
      (raw.prepare('SELECT COUNT(*) AS n FROM news_seen').get() as { n: number }).n,
    ).toBe(1)
    expect(() =>
      raw
        .prepare(
          `INSERT INTO events
            (monitor_id, user_id, type, severity, payload_json, dedupe_key, source, created_at)
           VALUES (1, 1, 'release_date', 'info', '{}', 'release-date-1', 'steam', 200)`,
        )
        .run(),
    ).not.toThrow()
    raw.close()
  })

  it('enforces case-insensitive usernames', () => {
    makeUser('Alice')
    expect(findUserByUsername(db, 'alice')?.username).toBe('Alice')
    expect(() => makeUser('ALICE')).toThrowError(/UNIQUE/i)
  })

  it('stores users and sessions', () => {
    const user = makeUser()
    expect(countActiveAdmins(db)).toBe(1)
    updateUser(db, user.id, { region: 'cn', language: 'schinese' })
    expect(findUserByUsername(db, 'admin')?.region).toBe('cn')

    createSession(db, {
      tokenHash: 'hash-1',
      userId: user.id,
      expiresAt: Date.now() + 60_000,
    })
    const session = findSessionWithUser(db, 'hash-1', Date.now())
    expect(session?.user.id).toBe(user.id)
    expect(findSessionWithUser(db, 'hash-1', Date.now() + 120_000)).toBeUndefined()
  })

  it('enforces one monitor per user and appid', () => {
    const user = makeUser()
    const input = {
      userId: user.id,
      appid: 1091500,
      kind: 'game' as const,
      name: 'Cyberpunk 2077',
      storeUrl: 'https://store.steampowered.com/app/1091500/',
      region: 'cn',
      language: 'schinese',
      nextCheckAt: Date.now(),
    }
    createMonitor(db, input)
    expect(() => createMonitor(db, input)).toThrowError(/UNIQUE/i)
    expect(findMonitorByAppid(db, user.id, 1091500)?.name).toBe('Cyberpunk 2077')
    expect(listMonitors(db, user.id, { page: 1, pageSize: 20 }).total).toBe(1)
  })

  it('deduplicates events by dedupe key', () => {
    const user = makeUser()
    const monitor = createMonitor(db, {
      userId: user.id,
      appid: 10,
      kind: 'game',
      name: 'Test',
      storeUrl: 'https://store.steampowered.com/app/10/',
      region: 'cn',
      language: 'schinese',
      nextCheckAt: Date.now(),
    })
    const eventInput = {
      monitorId: monitor.id,
      userId: user.id,
      type: 'sale_start' as const,
      severity: 'info' as const,
      payload: { discountPercent: 50 },
      dedupeKey: `sale_start:${monitor.id}:1`,
    }
    expect(createEvent(db, eventInput).created).toBe(true)
    expect(createEvent(db, eventInput).created).toBe(false)
  })

  it('claims deliveries once and marks them sent', () => {
    const user = makeUser()
    const delivery = createDelivery(db, {
      userId: user.id,
      kind: 'command',
      payload: { text: 'hello' },
      nextAttemptAt: 0,
    })
    const now = Date.now()
    const claimed = claimDueDeliveries(db, now, 5)
    expect(claimed.map((row) => row.id)).toEqual([delivery.id])
    expect(claimDueDeliveries(db, now, 5)).toHaveLength(0)
    markDeliverySent(db, delivery.id, 200)
    const row = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id) as {
      status: string
      attempts: number
    }
    expect(row.status).toBe('sent')
    expect(row.attempts).toBe(1)
  })

  it('stores settings as JSON', () => {
    expect(getRetention(db).snapshotsDays).toBe(90)
    setSetting(db, 'cache_ttl_seconds', 600)
    expect(getSetting(db, 'cache_ttl_seconds', 0)).toBe(600)
  })
})
