import { Hono } from 'hono'
import { SteamSearchQuerySchema } from '../../../shared/schemas'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseQuery } from '../respond'
import { requireAuth, requireOnboarded, requirePasswordChanged } from '../middleware/guards'
import { badGateway } from '../../lib/errors'
import type { UserRow } from '../../db/rows'
import { searchStore } from '../../steam/storesearch'
import { SteamRequestError } from '../../steam/client'

export function steamRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.use('*', requireAuth(db), requirePasswordChanged(), requireOnboarded())

  router.get('/search', async (c) => {
    const user = c.get('user') as UserRow
    const query = parseQuery(c, SteamSearchQuerySchema)
    const region = query.region ?? user.region
    const language = query.language ?? user.language
    if (!region || !language) {
      return c.json({ items: [] })
    }
    try {
      const items = await searchStore(query.q, region, language, {
        limiter: runtime.limiter,
        limit: 5,
      })
      return c.json({ items, region, language })
    } catch (error) {
      if (error instanceof SteamRequestError) {
        throw badGateway('Steam 搜索暂时不可用，请稍后重试')
      }
      throw error
    }
  })

  return router
}
