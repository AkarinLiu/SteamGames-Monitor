import { Hono } from 'hono'
import { z } from 'zod'
import { UpdateMeSchema } from '../../../shared/schemas'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseJson } from '../respond'
import { requireAuth } from '../middleware/guards'
import { findUserById, publicUser, updateUser } from '../../db/repo/users'
import { resetMonitorsForRegion } from '../../db/repo/monitors'
import { writeAudit } from '../../db/repo/audit'
import { getClientIp } from '../../lib/request'
import type { UserRow } from '../../db/rows'

const DisplayNameOnlySchema = z.object({
  displayName: z.string().trim().min(1).max(48),
})

const SettingsOnlySchema = UpdateMeSchema.omit({ displayName: true })

export function meRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db
  router.use('*', requireAuth(db))

  router.get('/', (c) => {
    const user = c.get('user') as UserRow
    return c.json({ user: publicUser(user) })
  })

  router.patch('/', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, DisplayNameOnlySchema)
    const updated = updateUser(db, user.id, { displayName: input.displayName })
    writeAudit(db, {
      actorUserId: user.id,
      action: 'user.profile_update',
      target: `user:${user.id}`,
      ip: getClientIp(c),
    })
    return c.json({ user: publicUser(updated as UserRow) })
  })

  router.get('/settings', (c) => {
    const user = c.get('user') as UserRow
    return c.json({ user: publicUser(user) })
  })

  router.patch('/settings', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, SettingsOnlySchema)
    const now = Date.now()
    const regionChanged = Boolean(input.region && input.region !== user.region)
    let monitorsReset = 0
    const updated = db.transaction(() => {
      if (regionChanged && input.region) {
        monitorsReset = resetMonitorsForRegion(db, user.id, input.region, now)
      }
      updateUser(db, user.id, {
        region: input.region,
        language: input.language,
        timezone: input.timezone,
        pollIntervalSeconds: input.pollIntervalSeconds,
        minDiscountPercent: input.minDiscountPercent,
        newsEnabled: input.newsEnabled,
        newsKeywords: input.newsKeywords,
        newsMatchMode: input.newsMatchMode,
      })
      writeAudit(db, {
        actorUserId: user.id,
        action: 'user.settings_update',
        target: `user:${user.id}`,
        detail: {
          regionChanged,
          region: input.region ?? user.region,
          language: input.language ?? user.language,
        },
        ip: getClientIp(c),
      })
      return findUserById(db, user.id) as UserRow
    })
    return c.json({
      user: publicUser(updated),
      regionChanged,
      monitorsReset,
    })
  })

  return router
}
