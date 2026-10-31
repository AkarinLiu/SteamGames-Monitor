import { Hono } from 'hono'
import {
  ChangePasswordSchema,
  LoginSchema,
  OnboardingSchema,
} from '../../../shared/schemas'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseJson } from '../respond'
import { requireAuth, requirePasswordChanged } from '../middleware/guards'
import { getClientIp, getUserAgent } from '../../lib/request'
import {
  issueSession,
  revokeSession,
  setSessionCookie,
} from '../../auth/session'
import { publicUser, updateUser, findUserById } from '../../db/repo/users'
import { updatePassword } from '../../db/repo/users'
import { deleteUserSessions } from '../../db/repo/sessions'
import { resetMonitorsForRegion } from '../../db/repo/monitors'
import { writeAudit } from '../../db/repo/audit'
import { badRequest } from '../../lib/errors'
import { verifyPassword, hashPassword } from '../../auth/password'
import type { UserRow } from '../../db/rows'
import { safeJsonParse } from '../../../shared/utils'

export function authRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.post('/login', async (c) => {
    const input = await parseJson(c, LoginSchema)
    const ip = getClientIp(c)
    try {
      const result = await runtime.loginService.login(db, input, ip, getUserAgent(c))
      setSessionCookie(c, result.session.token)
      return c.json({ user: publicUser(result.user) })
    } catch (error) {
      if (error instanceof Error && 'details' in error) {
        const details = (error as { details?: { retryAfterSeconds?: number } }).details
        if (details?.retryAfterSeconds) {
          c.header('retry-after', String(details.retryAfterSeconds))
        }
      }
      throw error
    }
  })

  router.post('/logout', (c) => {
    revokeSession(db, c)
    return c.json({ ok: true })
  })

  router.get('/me', requireAuth(db), (c) => {
    const user = c.get('user') as UserRow
    return c.json({ user: publicUser(user) })
  })

  router.post('/password', requireAuth(db), async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, ChangePasswordSchema)
    const valid = await verifyPassword(input.currentPassword, user.password_hash)
    if (!valid) throw badRequest('当前密码不正确')
    if (input.currentPassword === input.newPassword) {
      throw badRequest('新密码不能与当前密码相同')
    }
    const passwordHash = await hashPassword(input.newPassword)
    db.transaction(() => {
      updatePassword(db, user.id, passwordHash)
      deleteUserSessions(db, user.id)
      writeAudit(db, {
        actorUserId: user.id,
        action: 'auth.password_change',
        target: `user:${user.id}`,
        ip: getClientIp(c),
      })
    })
    const session = issueSession(db, user.id, getClientIp(c), getUserAgent(c))
    setSessionCookie(c, session.token)
    const updated = findUserById(db, user.id) as UserRow
    return c.json({ user: publicUser(updated) })
  })

  router.post(
    '/onboarding',
    requireAuth(db),
    requirePasswordChanged(),
    async (c) => {
      const user = c.get('user') as UserRow
      const input = await parseJson(c, OnboardingSchema)
      const now = Date.now()
      const regionChanged = Boolean(user.region && user.region !== input.region)
      let monitorsReset = 0
      const updated = db.transaction(() => {
        if (regionChanged) {
          monitorsReset = resetMonitorsForRegion(db, user.id, input.region, now)
        }
        const row = updateUser(db, user.id, {
          region: input.region,
          language: input.language,
          timezone: input.timezone,
          uiLocale: input.uiLocale,
          pollIntervalSeconds: input.pollIntervalSeconds ?? user.poll_interval_seconds,
          minDiscountPercent: input.minDiscountPercent ?? user.min_discount_percent,
          newsEnabled: input.newsEnabled ?? user.news_enabled === 1,
          newsKeywords:
            input.newsKeywords ?? safeJsonParse<string[]>(user.news_keywords_json, []),
          newsMatchMode: input.newsMatchMode ?? (user.news_match_mode as 'title' | 'any'),
          onboardedAt: user.onboarded_at ?? now,
        })
        writeAudit(db, {
          actorUserId: user.id,
          action: 'user.onboarding',
          target: `user:${user.id}`,
          detail: { region: input.region, language: input.language, timezone: input.timezone },
          ip: getClientIp(c),
        })
        return row as UserRow
      })
      return c.json({ user: publicUser(updated), monitorsReset })
    },
  )

  return router
}
