import { Hono } from 'hono'
import {
  CreateMonitorSchema,
  ImportDlcSchema,
  MonitorListQuerySchema,
  SnapshotListQuerySchema,
  UpdateMonitorSchema,
} from '../../../shared/schemas'
import { toMonitor } from '../../db/rows'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseIdParam, parseJson, parseQuery } from '../respond'
import { requireAuth, requireOnboarded, requirePasswordChanged } from '../middleware/guards'
import { env } from '../../env'
import { AppError, badGateway, conflict, notFound } from '../../lib/errors'
import type { UserRow } from '../../db/rows'
import {
  countMonitorsForUser,
  findMonitorById,
  getMonitorStats,
  listMonitors,
  setMonitorEnabled,
  softDeleteMonitor,
  updateMonitor,
} from '../../db/repo/monitors'
import { countSnapshots, listSnapshots } from '../../db/repo/snapshots'
import { countEventsForMonitor, listMonitorEvents } from '../../db/repo/events'
import { addMonitor, importDlcMonitors, type AddContext } from '../../monitor/addMonitor'
import { NEW_MONITOR_DELAY_MS } from '../../monitor/policies'
import type { AddMonitorOutcome, ImportDlcOutcome } from '../../monitor/addMonitor'

function addContext(runtime: Runtime): AddContext {
  return {
    db: runtime.db,
    limiter: runtime.limiter,
    maxTotalMonitors: env.MAX_TOTAL_MONITORS,
  }
}

function throwAddError(outcome: Extract<AddMonitorOutcome | ImportDlcOutcome, { status: 'error' }>): never {
  if (outcome.code === 'not_found') throw notFound(outcome.message)
  if (outcome.code === 'rate_limited') {
    throw new AppError(429, 'steam_rate_limited', outcome.message)
  }
  throw badGateway(outcome.message)
}

export function monitorRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.use('*', requireAuth(db), requirePasswordChanged(), requireOnboarded())

  router.get('/', (c) => {
    const user = c.get('user') as UserRow
    const query = parseQuery(c, MonitorListQuerySchema)
    const { rows, total } = listMonitors(db, user.id, {
      q: query.q,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
    })
    return c.json({
      items: rows.map(toMonitor),
      total,
      page: query.page,
      pageSize: query.pageSize,
      stats: getMonitorStats(db, user.id),
      quota: {
        used: countMonitorsForUser(db, user.id),
        limit: Math.min(Number(user.max_monitors), 200),
      },
    })
  })

  router.post('/', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, CreateMonitorSchema)
    const outcome = await addMonitor(addContext(runtime), user, input)
    switch (outcome.status) {
      case 'added':
        return c.json({ monitor: toMonitor(outcome.monitor) }, 201)
      case 'already_exists':
        throw conflict('该游戏已在监控列表中', { monitorId: outcome.monitor.id })
      case 'selection_required':
        throw new AppError(409, 'selection_required', '找到多个匹配结果，请选择具体条目', {
          query: outcome.query,
          results: outcome.results,
        })
      case 'not_available':
        throw new AppError(
          422,
          'not_available',
          `在区域 ${outcome.region} 无法获取该条目（不存在 / 已下架 / 区域不可售）`,
          { appid: outcome.appid, requireForce: true },
        )
      case 'quota_exceeded':
        throw conflict(outcome.message)
      case 'error':
        throwAddError(outcome)
    }
  })

  router.post('/import-dlc', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, ImportDlcSchema)
    const outcome = await importDlcMonitors(
      addContext(runtime),
      user,
      input.query,
      input.max,
    )
    switch (outcome.status) {
      case 'ok':
        return c.json({
          items: outcome.created.map(toMonitor),
          skipped: outcome.skipped,
          failed: outcome.failed,
        })
      case 'selection_required':
        throw new AppError(409, 'selection_required', '找到多个匹配结果，请选择基础游戏', {
          query: outcome.query,
          results: outcome.results,
        })
      case 'not_available':
        throw new AppError(422, 'not_available', `在区域 ${outcome.region} 无法获取该游戏`)
      case 'no_dlc':
        throw conflict('该游戏没有可导入的 DLC')
      case 'quota_exceeded':
        throw conflict(outcome.message)
      case 'error':
        throwAddError(outcome)
    }
  })

  router.get('/:id', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findMonitorById(db, user.id, id)
    if (!row) throw notFound('监控项不存在')
    return c.json({
      monitor: {
        ...toMonitor(row),
        snapshotCount: countSnapshots(db, id),
        eventCount: countEventsForMonitor(db, id),
      },
    })
  })

  router.patch('/:id', async (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findMonitorById(db, user.id, id)
    if (!row) throw notFound('监控项不存在')
    const input = await parseJson(c, UpdateMonitorSchema)
    const patch: Parameters<typeof updateMonitor>[2] = {
      notes: input.notes,
      minDiscountPercent: input.minDiscountPercent,
      newsWatch: input.newsWatch,
    }
    if (input.enabled !== undefined) {
      patch.enabled = input.enabled
      patch.nextCheckAt = input.enabled ? Date.now() + NEW_MONITOR_DELAY_MS : row.next_check_at
    }
    const updated = updateMonitor(db, id, patch)
    return c.json({ monitor: toMonitor(updated!) })
  })

  router.delete('/:id', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    if (!softDeleteMonitor(db, user.id, id)) throw notFound('监控项不存在')
    return c.json({ ok: true })
  })

  router.post('/:id/check', async (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findMonitorById(db, user.id, id)
    if (!row) throw notFound('监控项不存在')
    const outcome = await runtime.checkMonitor(id, { force: true, source: 'manual' })
    if (outcome.status === 'skipped') throw conflict('该监控项当前无法检查')
    const refreshed = findMonitorById(db, user.id, id)
    return c.json({ monitor: refreshed ? toMonitor(refreshed) : null, outcome })
  })

  router.post('/:id/pause', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    if (!setMonitorEnabled(db, user.id, id, false)) throw notFound('监控项不存在')
    const row = findMonitorById(db, user.id, id)
    return c.json({ monitor: row ? toMonitor(row) : null })
  })

  router.post('/:id/resume', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    if (!setMonitorEnabled(db, user.id, id, true)) throw notFound('监控项不存在')
    updateMonitor(db, id, { nextCheckAt: Date.now() })
    const row = findMonitorById(db, user.id, id)
    return c.json({ monitor: row ? toMonitor(row) : null })
  })

  router.get('/:id/snapshots', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findMonitorById(db, user.id, id)
    if (!row) throw notFound('监控项不存在')
    const query = parseQuery(c, SnapshotListQuerySchema)
    const since = Date.now() - query.days * 24 * 60 * 60 * 1000
    const items = listSnapshots(db, user.id, id, since, query.limit)
    return c.json({ items, days: query.days })
  })

  router.get('/:id/events', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findMonitorById(db, user.id, id)
    if (!row) throw notFound('监控项不存在')
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
    return c.json({ items: listMonitorEvents(db, user.id, id, limit) })
  })

  return router
}
