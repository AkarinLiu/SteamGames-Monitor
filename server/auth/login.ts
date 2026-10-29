import { LIMITS } from '../../shared/constants'
import type { LoginInput } from '../../shared/schemas'
import type { Db } from '../db/database'
import { findUserByUsername, findUserById, touchLastLogin } from '../db/repo/users'
import { writeAudit } from '../db/repo/audit'
import type { UserRow } from '../db/rows'
import { tooManyRequests, unauthorized } from '../lib/errors'
import { verifyPassword } from './password'
import { issueSession, type IssuedSession } from './session'
import { SlidingWindowLimiter } from './rateLimit'

const DUMMY_HASH = `scrypt$32768$8$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`

export interface LoginResult {
  user: UserRow
  session: IssuedSession
}

export class LoginService {
  private readonly accountLimiter = new SlidingWindowLimiter(
    LIMITS.loginMaxAttempts,
    LIMITS.loginWindowMs,
  )
  private readonly ipLimiter = new SlidingWindowLimiter(30, LIMITS.loginWindowMs)

  async login(
    db: Db,
    input: LoginInput,
    ip: string,
    userAgent: string | null,
  ): Promise<LoginResult> {
    const username = input.username.trim().toLowerCase()
    const accountKey = `${ip}|${username}`
    const ipKey = `ip|${ip}`

    for (const [limiter, key] of [
      [this.accountLimiter, accountKey],
      [this.ipLimiter, ipKey],
    ] as const) {
      const result = limiter.check(key)
      if (!result.allowed) {
        throw tooManyRequests('登录尝试过于频繁，请稍后再试', {
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        })
      }
    }

    const row = findUserByUsername(db, input.username)
    const valid = await verifyPassword(input.password, row?.password_hash ?? DUMMY_HASH)
    if (!row || !valid || row.status !== 'active') {
      this.accountLimiter.hit(accountKey)
      this.ipLimiter.hit(ipKey)
      writeAudit(db, {
        actorUserId: row?.id ?? null,
        action: 'auth.login_failed',
        target: row ? `user:${row.id}` : null,
        detail: { username: input.username },
        ip,
      })
      throw unauthorized('用户名或密码错误')
    }

    this.accountLimiter.reset(accountKey)
    touchLastLogin(db, row.id)
    const session = issueSession(db, row.id, ip, userAgent)
    writeAudit(db, {
      actorUserId: row.id,
      action: 'auth.login',
      target: `user:${row.id}`,
      ip,
    })
    return { user: findUserById(db, row.id) as UserRow, session }
  }

  purge(): void {
    const now = Date.now()
    this.accountLimiter.purge(now)
    this.ipLimiter.purge(now)
  }
}
