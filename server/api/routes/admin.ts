import { Hono } from 'hono'
import {
  CreateUserSchema,
  ResetPasswordSchema,
  UpdateAdminSettingsSchema,
  UpdateUserSchema,
  BatchUserActionSchema,
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
  setUserStatus,
} from '../../db/repo/users'
import { deleteUserSessions } from '../../db/repo/sessions'
import {
  writeAudit,
  listAuditLogsFiltered,
  distinctAuditActions,
  distinctAuditActors,
} from '../../db/repo/audit'
import { listLoginLogs } from '../../db/repo/loginLogs'
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

  router.post('/users/batch', async (c) => {
    const actor = c.get('user') as UserRow
    const input = await parseJson(c, BatchUserActionSchema)
    const succeeded: number[] = []
    const failed: Array<{ id: number; reason: string }> = []

    for (const id of input.ids) {
      const target = findUserById(db, id)
      if (!target) {
        failed.push({ id, reason: '用户不存在' })
        continue
      }
      try {
        db.transaction(() => {
          if (input.action === 'enable') {
            setUserStatus(db, target.id, 'active')
            writeAudit(db, {
              actorUserId: actor.id,
              action: 'admin.user_update',
              target: `user:${target.id}`,
              detail: { status: 'active', batch: true },
              ip: getClientIp(c),
            })
          } else if (input.action === 'disable') {
            if (target.id === actor.id) throw conflict('不能禁用当前登录的管理员账号')
            if (
              target.role === 'admin' &&
              countOtherActiveAdmins(db, target.id) === 0
            ) {
              throw conflict('必须保留至少一个启用的管理员')
            }
            setUserStatus(db, target.id, 'disabled')
            deleteUserSessions(db, target.id)
            writeAudit(db, {
              actorUserId: actor.id,
              action: 'admin.user_update',
              target: `user:${target.id}`,
              detail: { status: 'disabled', batch: true },
              ip: getClientIp(c),
            })
          } else if (input.action === 'force_change_password') {
            setUserPasswordHash(db, target.id, target.password_hash, true)
            deleteUserSessions(db, target.id)
            writeAudit(db, {
              actorUserId: actor.id,
              action: 'admin.user_reset_password',
              target: `user:${target.id}`,
              detail: { batch: true, keptPassword: true },
              ip: getClientIp(c),
            })
          } else if (input.action === 'set_max_monitors') {
            updateUser(db, target.id, { maxMonitors: input.maxMonitors })
            writeAudit(db, {
              actorUserId: actor.id,
              action: 'admin.user_update',
              target: `user:${target.id}`,
              detail: { maxMonitors: input.maxMonitors, batch: true },
              ip: getClientIp(c),
            })
          } else if (input.action === 'delete') {
            if (target.id === actor.id) throw conflict('不能删除当前登录的账号')
            if (target.role === 'admin' && countActiveAdmins(db) <= 1) {
              throw conflict('必须保留至少一个启用的管理员')
            }
            writeAudit(db, {
              actorUserId: actor.id,
              action: 'admin.user_delete',
              target: `user:${target.id}`,
              detail: { username: target.username, batch: true },
              ip: getClientIp(c),
            })
            deleteUser(db, target.id)
          }
        })
        succeeded.push(target.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        failed.push({ id: target.id, reason: message })
      }
    }

    writeAudit(db, {
      actorUserId: actor.id,
      action: 'admin.batch',
      target: `action:${input.action}`,
      detail: {
        action: input.action,
        ids: input.ids,
        succeeded,
        failed,
      },
      ip: getClientIp(c),
    })

    return c.json({ succeeded, failed })
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

  router.get('/audit', (c) => {
    const query = c.req.query()
    const actions = query.actions
      ? String(query.actions)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined
    const actorUserId = query.actorUserId ? Number(query.actorUserId) : undefined
    const since = query.since ? Number(query.since) : undefined
    const until = query.until ? Number(query.until) : undefined
    const offset = query.offset ? Number(query.offset) : undefined
    const limit = query.limit ? Number(query.limit) : undefined
    const target = query.target ? String(query.target) : undefined

    if (actorUserId !== undefined && Number.isNaN(actorUserId)) {
      throw conflict('actorUserId 必须是数字')
    }
    const page = listAuditLogsFiltered(db, {
      actorUserId: Number.isNaN(actorUserId as number) ? undefined : actorUserId,
      actions,
      target,
      since: Number.isNaN(since as number) ? undefined : since,
      until: Number.isNaN(until as number) ? undefined : until,
      offset,
      limit,
    })
    return c.json(page)
  })

  router.get('/audit/facets', (c) => {
    void c
    return c.json({
      actions: distinctAuditActions(db),
      actors: distinctAuditActors(db),
    })
  })

  router.get('/logins', (c) => {
    const query = c.req.query()
    const userId = query.userId ? Number(query.userId) : undefined
    const since = query.since ? Number(query.since) : undefined
    const until = query.until ? Number(query.until) : undefined
    const offset = query.offset ? Number(query.offset) : undefined
    const limit = query.limit ? Number(query.limit) : undefined
    const successParam = query.success
    const success =
      successParam === '1' || successParam === 'true'
        ? true
        : successParam === '0' || successParam === 'false'
          ? false
          : undefined

    if (userId !== undefined && Number.isNaN(userId)) {
      throw conflict('userId 必须是数字')
    }
    return c.json(
      listLoginLogs(db, {
        userId: Number.isNaN(userId as number) ? undefined : userId,
        since: Number.isNaN(since as number) ? undefined : since,
        until: Number.isNaN(until as number) ? undefined : until,
        success,
        offset,
        limit,
      }),
    )
  })

  router.get('/users/:id/logins', (c) => {
    const id = parseIdParam(c)
    ensureTarget(db, id)
    const query = c.req.query()
    const since = query.since ? Number(query.since) : undefined
    const until = query.until ? Number(query.until) : undefined
    const offset = query.offset ? Number(query.offset) : undefined
    const limit = query.limit ? Number(query.limit) : undefined
    const successParam = query.success
    const success =
      successParam === '1' || successParam === 'true'
        ? true
        : successParam === '0' || successParam === 'false'
          ? false
          : undefined
    return c.json(
      listLoginLogs(db, {
        userId: id,
        since: Number.isNaN(since as number) ? undefined : since,
        until: Number.isNaN(until as number) ? undefined : until,
        success,
        offset,
        limit,
      }),
    )
  })

  return router
}
