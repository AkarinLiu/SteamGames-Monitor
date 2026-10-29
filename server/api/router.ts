import { Hono } from 'hono'
import type { AppBindings } from './context'
import type { Runtime } from '../runtime'
import { setupRoutes } from './routes/setup'
import { authRoutes } from './routes/auth'
import { meRoutes } from './routes/me'
import { adminRoutes } from './routes/admin'
import { monitorRoutes } from './routes/monitors'
import { eventRoutes } from './routes/events'
import { dashboardRoutes } from './routes/dashboard'
import { steamRoutes } from './routes/steam'
import { channelRoutes } from './routes/channels'
import { botRoutes } from './routes/bots'
import { devRoutes } from './routes/dev'

export function createApiRouter(runtime: Runtime): Hono<AppBindings> {
  const api = new Hono<AppBindings>()
  api.route('/setup', setupRoutes(runtime))
  api.route('/auth', authRoutes(runtime))
  api.route('/me', meRoutes(runtime))
  api.route('/admin', adminRoutes(runtime))
  api.route('/monitors', monitorRoutes(runtime))
  api.route('/events', eventRoutes(runtime))
  api.route('/channels', channelRoutes(runtime))
  api.route('/bots', botRoutes(runtime))
  api.route('/dev', devRoutes(runtime))
  api.route('/dashboard', dashboardRoutes(runtime))
  api.route('/steam', steamRoutes(runtime))
  return api
}
