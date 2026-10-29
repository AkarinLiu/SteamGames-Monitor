import { Hono } from 'hono'
import {
  CreateUserSchema,
  ResetPasswordSchema,
  UpdateAdminSettingsSchema,
  UpdateUserSchema,
} from '../../../shared/schemas'
import { LIMITS } from '../../../shared/constants'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseIdParam, parseJson } from '../respond'
import { requireAdmin, requireAuth, requirePasswordChanged } from '../middleware/guards'
import { env } from '../../env'
import {
  countActiveAdmins,
  createUser,
  deleteUser,
  findUserById,
  findUserByUsername,
  listAdminSummaries,
  publicUser,
  updateUser,
  setUserPasswordHash,
} from '../../db/repo/users'
import { deleteUserSessions } from '../../db/repo/sessions'
import { writeAudit } from '../../db/repo/audit'
import { hashPassword, generateTemporaryPassword } from '../../auth/password'
import { conflict, notFound } from '../../lib/errors'
import { isUniqueViolation } from '../../db/database'
import {
  getSystemSettings,
  setRetention,
  setSetting,
  SETTING_KEYS,
} from '../../db/repo/settings'
import type { UserRow } from '../../db/rows'
import { getClientIp } from '../../lib/request'
import {
  countAllMonitors,
  countDueMonitors,
  countDueNewsMonitors,
  countEnabledMonitors,
} from '../../db/repo/monitors'
import { getQueueStats } from '../../db/repo/deliveries'

function countOtherActiveAdmins(db: Runtime['db'], targetId: number): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id != ?",
    )
    .get(targetId) as { n: number }
  return Number(row.n)
}

function ensureTarget(db: Runtime['db'], id: number): UserRow {
  const target = findUserById(db, id)
  if (!target) throw notFound('用户不存在')
  return target
}

export function adminRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db
  router.use('*', requireAuth(db), requirePasswordChanged(), requireAdmin())

  router.get('/users', (c) => {
    return c.json({ users: listAdminSummaries(db, Date.now()) })
  })

  router.post('/users', async (c) => {
    const input = await parseJson(c, CreateUserSchema)
    if (findUserByUsername(db, input.username)) throw conflict('用户名已存在')
    const passwordHash = await hashPassword(input.password)
    try {
      const created = db.transaction(() => {
        const onboardedAt =
          input.region && input.language && input.timezone ? Date.now() : null
        const user = createUser(db, {
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          role: input.role,
          maxMonitors: input.maxMonitors ?? LIMITS.maxMonitorsPerUser,
          region: input.region,
          language: input.language,
          timezone: input.timezone,
          mustChangePassword: true,
          onboardedAt,
        })
        writeAudit(db, {
          actorUserId: c.get('user')?.id ?? null,
          action: 'admin.user_create',
          target: `user:${user.id}`,
          detail: { username: user.username, role: user.role },
          ip: getClientIp(c),
        })
        return user
      })
      return c.json({ user: publicUser(created) }, 201)
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('用户名已存在')
      throw error
    }
  })

  router.patch('/users/:id', async (c) => {
    const actor = c.get('user') as UserRow
    const id = parseIdParam(c)
    const input = await parseJson(c, UpdateUserSchema)
    const target = ensureTarget(db, id)

    if (target.id === actor.id && input.role === 'member') {
      throw conflict('不能取消自己的管理员权限')
    }
    if (target.id === actor.id && input.status === 'disabled') {
      throw conflict('不能禁用当前登录的管理员账号')
    }
    const demoting = target.role === 'admin' && input.role === 'member'
    const disabling = target.role === 'admin' && input.status === 'disabled'
    if ((demoting || disabling) && countOtherActiveAdmins(db, target.id) === 0) {
      throw conflict('必须保留至少一个启用的管理员')
    }

    const updated = db.transaction(() => {
      const row = updateUser(db, id, {
        displayName: input.displayName,
        role: input.role,
        status: input.status,
        maxMonitors: input.maxMonitors,
        mustChangePassword: input.mustChangePassword,
      }) as UserRow
      if (input.status === 'disabled') {
        deleteUserSessions(db, id)
      }
      writeAudit(db, {
        actorUserId: actor.id,
        action: 'admin.user_update',
        target: `user:${id}`,
        detail: {
          displayName: input.displayName,
          role: input.role,
          status: input.status,
          maxMonitors: input.maxMonitors,
        },
        ip: getClientIp(c),
      })
      return row
    })
    return c.json({ user: publicUser(updated) })
  })

  router.post('/users/:id/reset-password', async (c) => {
    const actor = c.get('user') as UserRow
    const id = parseIdParam(c)
    const input = await parseJson(c, ResetPasswordSchema)
    const target = ensureTarget(db, id)
    const plain = input.password ?? generateTemporaryPassword()
    const passwordHash = await hashPassword(plain)
    db.transaction(() => {
      setUserPasswordHash(db, target.id, passwordHash, true)
      deleteUserSessions(db, target.id)
      writeAudit(db, {
        actorUserId: actor.id,
        action: 'admin.user_reset_password',
        target: `user:${target.id}`,
        ip: getClientIp(c),
      })
    })
    return c.json({ password: plain, mustChangePassword: true })
  })

  router.delete('/users/:id', (c) => {
    const actor = c.get('user') as UserRow
    const id = parseIdParam(c)
    const target = ensureTarget(db, id)
    if (target.id === actor.id) throw conflict('不能删除当前登录的账号')
    if (target.role === 'admin' && countActiveAdmins(db) <= 1) {
      throw conflict('必须保留至少一个启用的管理员')
    }
    db.transaction(() => {
      writeAudit(db, {
        actorUserId: actor.id,
        action: 'admin.user_delete',
        target: `user:${target.id}`,
        detail: { username: target.username },
        ip: getClientIp(c),
      })
      deleteUser(db, target.id)
    })
    return c.json({ ok: true })
  })

  router.get('/settings', (c) => {
    return c.json({ settings: getSystemSettings(db, env.MAX_TOTAL_MONITORS) })
  })

  router.get('/health', (c) => {
    const now = Date.now()
    const queue = getQueueStats(db, now)
    const limiter = runtime.limiter.snapshot()
    const dueMonitors = countDueMonitors(db, now)
    const dueNews = countDueNewsMonitors(db, now)
    const enabledMonitors = countEnabledMonitors(db)
    return c.json({
      uptimeSeconds: Math.floor((now - runtime.startedAt) / 1000),
      env: env.NODE_ENV,
      monitors: {
        total: countAllMonitors(db),
        enabled: enabledMonitors,
        dueNow: dueMonitors,
        dueNewsNow: dueNews,
        maxTotal: env.MAX_TOTAL_MONITORS,
      },
      scheduler: {
        running: runtime.scheduler.running,
        inflightGroups: runtime.scheduler.inflightKeyCount,
      },
      newsScanner: { running: runtime.newsScanner.isRunning },
      delivery: {
        running: runtime.deliveryWorker.isRunning,
        ...queue,
      },
      steam: {
        capacity: limiter.capacity,
        tokensRemaining: limiter.tokens,
        cooldownUntil: limiter.cooldownUntil,
        cooldownMs: runtime.limiter.getCooldownMs(),
      },
      cacheTtlSeconds: runtime.cacheTtlMs / 1000,
    })
  })

  router.patch('/settings', async (c) => {
    const actor = c.get('user') as UserRow
    const input = await parseJson(c, UpdateAdminSettingsSchema)
    db.transaction(() => {
      if (input.defaultPollIntervalSeconds !== undefined) {
        setSetting(
          db,
          SETTING_KEYS.defaultPollIntervalSeconds,
          input.defaultPollIntervalSeconds,
        )
      }
      if (input.defaultMinDiscountPercent !== undefined) {
        setSetting(
          db,
          SETTING_KEYS.defaultMinDiscountPercent,
          input.defaultMinDiscountPercent,
        )
      }
      if (input.cacheTtlSeconds !== undefined) {
        setSetting(db, SETTING_KEYS.cacheTtlSeconds, input.cacheTtlSeconds)
      }
      if (input.newsCacheTtlSeconds !== undefined) {
        setSetting(db, SETTING_KEYS.newsCacheTtlSeconds, input.newsCacheTtlSeconds)
      }
      if (input.retention) {
        setRetention(db, input.retention)
      }
      writeAudit(db, {
        actorUserId: actor.id,
        action: 'admin.settings_update',
        target: 'settings',
        detail: input as Record<string, unknown>,
        ip: getClientIp(c),
      })
    })
    return c.json({ settings: getSystemSettings(db, env.MAX_TOTAL_MONITORS) })
  })

  return router
}
