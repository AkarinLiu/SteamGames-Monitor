import { Hono } from 'hono'
import { BotAuthApproveSchema } from '../../../shared/schemas'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseJson } from '../respond'
import { requireAuth, requirePasswordChanged } from '../middleware/guards'
import { notFound } from '../../lib/errors'
import type { UserRow } from '../../db/rows'
import {
  approveBotAuthRequest,
  denyBotAuthRequest,
  getBotAuthRequestInfo,
} from '../../bots/authorization'

export function botAuthRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.use('*', requireAuth(db), requirePasswordChanged())

  router.get('/:token', (c) => {
    const user = c.get('user') as UserRow
    const info = getBotAuthRequestInfo(db, c.req.param('token'), user.id)
    if (!info) throw notFound('授权请求不存在或已失效')
    c.header('cache-control', 'no-store')
    return c.json(info)
  })

  router.post('/:token/approve', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, BotAuthApproveSchema)
    const info = approveBotAuthRequest(db, c.req.param('token'), user, input.role)
    c.header('cache-control', 'no-store')
    return c.json(info)
  })

  router.post('/:token/deny', (c) => {
    const user = c.get('user') as UserRow
    const info = denyBotAuthRequest(db, c.req.param('token'), user)
    c.header('cache-control', 'no-store')
    return c.json(info)
  })

  return router
}
