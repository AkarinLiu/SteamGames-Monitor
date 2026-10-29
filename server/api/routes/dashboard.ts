import { Hono } from 'hono'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { requireAuth, requirePasswordChanged } from '../middleware/guards'
import type { UserRow } from '../../db/rows'
import { getMonitorStats } from '../../db/repo/monitors'
import { countEventsSince, listRecentEvents } from '../../db/repo/events'
import {
  countFailedDeliveries,
  countPendingDeliveries,
} from '../../db/repo/deliveries'

export function dashboardRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.use('*', requireAuth(db), requirePasswordChanged())

  router.get('/', (c) => {
    const user = c.get('user') as UserRow
    const stats = getMonitorStats(db, user.id)
    return c.json({
      monitors: {
        total: stats.total,
        available: stats.available,
        onSale: stats.onSale,
        unavailable: stats.unavailable,
        comingSoon: stats.comingSoon,
        paused: stats.paused,
      },
      events24h: countEventsSince(db, user.id, Date.now() - 24 * 60 * 60 * 1000),
      failedDeliveries: countFailedDeliveries(db, user.id),
      pendingDeliveries: countPendingDeliveries(db, user.id),
      lastCheckAt: stats.lastCheckAt,
      recentEvents: listRecentEvents(db, user.id, 8),
    })
  })

  return router
}
