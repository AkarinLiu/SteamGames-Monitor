import { Hono } from 'hono'
import { EventListQuerySchema } from '../../../shared/schemas'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseIdParam, parseQuery } from '../respond'
import { requireAuth, requirePasswordChanged } from '../middleware/guards'
import { conflict, notFound } from '../../lib/errors'
import type { UserRow } from '../../db/rows'
import {
  deliverySummaries,
  findEventById,
  listEvents,
} from '../../db/repo/events'
import { resetFailedEventDeliveries } from '../../db/repo/deliveries'

export function eventRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.use('*', requireAuth(db), requirePasswordChanged())

  router.get('/', (c) => {
    const user = c.get('user') as UserRow
    const query = parseQuery(c, EventListQuerySchema)
    const { rows, total } = listEvents(db, user.id, {
      type: query.type,
      monitorId: query.monitorId,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    })
    const summaries = deliverySummaries(
      db,
      rows.map((row) => row.id),
    )
    const items = rows.map((row) => ({
      ...row,
      deliveries: summaries.get(row.id) ?? { total: 0, sent: 0, failed: 0, pending: 0 },
    }))
    return c.json({ items, total, page: query.page, pageSize: query.pageSize })
  })

  router.post('/:id/redeliver', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const event = findEventById(db, user.id, id)
    if (!event) throw notFound('事件不存在')
    const count = resetFailedEventDeliveries(db, user.id, id)
    if (count === 0) throw conflict('该事件没有可重投的失败投递')
    return c.json({ ok: true, reset: count })
  })

  return router
}
