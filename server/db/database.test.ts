import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from './database'
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
