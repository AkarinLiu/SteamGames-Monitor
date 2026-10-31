import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../db/database'
import { createMonitor, findMonitorByIdInternal, updateMonitor } from '../db/repo/monitors'
import { createUser, updateUser } from '../db/repo/users'
import { putNewsCache } from '../db/repo/caches'
import { monitorStatusLabel } from '../inbound/commands/format'
import { botMessages } from '../i18n'
import { NewsScanner } from './newsScanner'
import { SteamRateLimiter } from './rateLimiter'

const NOW = 1_800_000_000_000
const APP_ID = 424242

let db: Db

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

function setup(): number {
  const user = createUser(db, {
    username: 'news-user',
    displayName: 'News User',
    passwordHash: 'scrypt$test',
    role: 'member',
  })
  updateUser(db, user.id, { newsKeywords: ['delist'] })
  const monitor = createMonitor(db, {
    userId: user.id,
    appid: APP_ID,
    kind: 'game',
    name: 'Soon Gone',
    storeUrl: `https://store.steampowered.com/app/${APP_ID}/`,
    region: 'cn',
    language: 'schinese',
    nextCheckAt: NOW + 60_000,
    nextNewsCheckAt: NOW - 1_000,
  })
  putNewsCache(db, {
    appid: APP_ID,
    payloadJson: JSON.stringify([
      {
        gid: 'news-1',
        title: 'Soon Gone will be delisted soon',
        url: 'https://store.steampowered.com/news/app/424242/view/1',
        contents: '',
        date: NOW - 1_000,
        feedName: 'mock',
      },
    ]),
    fetchedAt: NOW - 1_000,
  })
  return monitor.id
}

function scanner(): NewsScanner {
  return new NewsScanner(db, new SteamRateLimiter(24, 60_000, () => NOW), { now: () => NOW })
}

describe('NewsScanner delisting warning status', () => {
  it('marks the monitor as delisting soon when a warning event is created', async () => {
    const monitorId = setup()
    const result = await scanner().tick()

    expect(result.eventsCreated).toBe(1)
    const monitor = findMonitorByIdInternal(db, monitorId)
    if (!monitor) throw new Error('monitor not found')
    expect(monitor.delisting_warning_at).toBe(NOW)
    expect(monitorStatusLabel(monitor, botMessages('zh-CN'))).toBe('即将停售')
  })

  it('does not extend the warning for news already seen', async () => {
    const monitorId = setup()
    await scanner().tick()
    updateMonitor(db, monitorId, { nextNewsCheckAt: NOW - 1 })

    const second = await scanner().tick()
    expect(second.eventsCreated).toBe(0)
    expect(findMonitorByIdInternal(db, monitorId)?.delisting_warning_at).toBe(NOW)
  })
})
