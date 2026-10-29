import { randomToken, sha256Hex } from '../lib/ids'
import { LIMITS } from '../../shared/constants'
import { env } from '../env'
import type { Db } from '../db/database'
import {
  createSession,
  deleteSession,
  findSessionWithUser,
  touchSession,
} from '../db/repo/sessions'
import type { UserRow } from '../db/rows'
import type { AppContext } from '../api/context'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

export const SESSION_COOKIE = 'sgm_session'
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

export interface IssuedSession {
  token: string
  tokenHash: string
  expiresAt: number
}

export function issueSession(
  db: Db,
  userId: number,
  ip: string | null,
  userAgent: string | null,
): IssuedSession {
  const token = randomToken(32)
  const tokenHash = sha256Hex(token)
  const expiresAt = Date.now() + LIMITS.sessionTtlMs
  createSession(db, { tokenHash, userId, expiresAt, ip, userAgent })
  return { token, tokenHash, expiresAt }
}

export function setSessionCookie(c: AppContext, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: env.COOKIE_SECURE,
    maxAge: Math.floor(LIMITS.sessionTtlMs / 1000),
  })
}

export function clearSessionCookie(c: AppContext): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export function sessionTokenHashFrom(c: AppContext): string | null {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token || token.length > 200) return null
  return sha256Hex(token)
}

export function resolveSessionUser(db: Db, c: AppContext, now = Date.now()): UserRow | null {
  const tokenHash = sessionTokenHashFrom(c)
  if (!tokenHash) return null
  const found = findSessionWithUser(db, tokenHash, now)
  if (!found) return null
  if (found.user.status !== 'active') {
    deleteSession(db, tokenHash)
    return null
  }
  if (now - Number(found.session.last_seen_at) >= TOUCH_INTERVAL_MS) {
    touchSession(db, tokenHash, now + LIMITS.sessionTtlMs)
  }
  c.set('user', found.user)
  c.set('sessionTokenHash', tokenHash)
  return found.user
}

export function revokeSession(db: Db, c: AppContext): void {
  const tokenHash = sessionTokenHashFrom(c)
  if (tokenHash) deleteSession(db, tokenHash)
  clearSessionCookie(c)
}

export function revokeSessionByHash(db: Db, tokenHash: string): void {
  deleteSession(db, tokenHash)
}
