import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database'
import type { Db } from './database'
import { createUser } from './repo/users'
import { writeAudit, listAuditLogsFiltered, distinctAuditActions, distinctAuditActors } from './repo/audit'
import { writeLoginLog, listLoginLogs } from './repo/loginLogs'

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

describe('audit log filtering', () => {
  it('filters by actions', () => {
    const user = makeUser()
    writeAudit(db, { actorUserId: user.id, action: 'auth.login', target: `user:${user.id}`, ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user.id, action: 'admin.user.update', target: `user:${user.id}`, ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user.id, action: 'monitor.create', target: 'monitor:1', ip: '127.0.0.1' })

    const page = listAuditLogsFiltered(db, { actions: ['auth.login', 'admin.user.update'] })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(2)
  })

  it('filters by actor', () => {
    const user1 = makeUser('admin1')
    const user2 = makeUser('admin2')
    writeAudit(db, { actorUserId: user1.id, action: 'auth.login', target: `user:${user1.id}`, ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user2.id, action: 'auth.login', target: `user:${user2.id}`, ip: '127.0.0.1' })

    const page = listAuditLogsFiltered(db, { actorUserId: user1.id })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.actor_user_id).toBe(user1.id)
  })

  it('filters by target with wildcard', () => {
    const user = makeUser()
    writeAudit(db, { actorUserId: user.id, action: 'auth.login', target: `user:${user.id}`, ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user.id, action: 'monitor.create', target: 'monitor:1', ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user.id, action: 'monitor.update', target: 'monitor:2', ip: '127.0.0.1' })

    const page = listAuditLogsFiltered(db, { target: 'user:*' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.action).toBe('auth.login')
  })

  it('returns distinct actions', () => {
    const user = makeUser()
    writeAudit(db, { actorUserId: user.id, action: 'auth.login', target: `user:${user.id}`, ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user.id, action: 'monitor.create', target: 'monitor:1', ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user.id, action: 'auth.login', target: `user:${user.id}`, ip: '127.0.0.1' })

    const actions = distinctAuditActions(db)
    expect(actions).toEqual(['auth.login', 'monitor.create'])
  })

  it('returns distinct actors', () => {
    const user1 = makeUser('admin1')
    const user2 = makeUser('admin2')
    writeAudit(db, { actorUserId: user1.id, action: 'auth.login', target: `user:${user1.id}`, ip: '127.0.0.1' })
    writeAudit(db, { actorUserId: user2.id, action: 'auth.login', target: `user:${user2.id}`, ip: '127.0.0.1' })

    const actors = distinctAuditActors(db)
    expect(actors).toHaveLength(2)
    expect(actors.map((a) => a.id)).toContain(user1.id)
    expect(actors.map((a) => a.id)).toContain(user2.id)
  })
})

describe('login logs', () => {
  it('writes success log', () => {
    const user = makeUser()
    writeLoginLog(db, { userId: user.id, username: user.username, ip: '127.0.0.1', userAgent: 'test', success: true })

    const page = listLoginLogs(db, {})
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.success).toBe(1)
    expect(page.items[0]!.reason).toBeNull()
  })

  it('writes failure log with reason', () => {
    writeLoginLog(db, { userId: null, username: 'unknown', ip: '127.0.0.1', userAgent: 'test', success: false, reason: 'user_not_found' })

    const page = listLoginLogs(db, {})
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.success).toBe(0)
    expect(page.items[0]!.reason).toBe('user_not_found')
  })

  it('filters by user', () => {
    const user1 = makeUser('admin1')
    const user2 = makeUser('admin2')
    writeLoginLog(db, { userId: user1.id, username: user1.username, ip: '127.0.0.1', userAgent: 'test', success: true })
    writeLoginLog(db, { userId: user2.id, username: user2.username, ip: '127.0.0.1', userAgent: 'test', success: true })

    const page = listLoginLogs(db, { userId: user1.id })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.user_id).toBe(user1.id)
  })

  it('filters by success status', () => {
    const user = makeUser()
    writeLoginLog(db, { userId: user.id, username: user.username, ip: '127.0.0.1', userAgent: 'test', success: true })
    writeLoginLog(db, { userId: user.id, username: user.username, ip: '127.0.0.1', userAgent: 'test', success: false, reason: 'password_wrong' })

    const page = listLoginLogs(db, { success: false })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.success).toBe(0)
  })
})
