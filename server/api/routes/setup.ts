import { Hono } from 'hono'
import { API_VERSION } from '../../../shared/constants'
import { SetupSchema } from '../../../shared/schemas'
import type { SetupStatus } from '../../../shared/types'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { isSetupCompleted } from '../../db/repo/settings'
import { completeSetup } from '../../auth/setup'
import { getClientIp, getUserAgent } from '../../lib/request'
import { issueSession, setSessionCookie } from '../../auth/session'
import { publicUser } from '../../db/repo/users'
import { parseJson } from '../respond'

export function setupRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()

  router.get('/status', (c) => {
    const body: SetupStatus = {
      setupRequired: !isSetupCompleted(runtime.db),
      version: API_VERSION,
    }
    return c.json(body)
  })

  router.post('/', async (c) => {
    const input = await parseJson(c, SetupSchema)
    const user = await completeSetup(runtime.db, input, getClientIp(c))
    const session = issueSession(runtime.db, user.id, getClientIp(c), getUserAgent(c))
    setSessionCookie(c, session.token)
    return c.json({ user: publicUser(user) }, 201)
  })

  return router
}
