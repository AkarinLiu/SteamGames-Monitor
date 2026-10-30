import type { MiddlewareHandler } from 'hono'
import type { Db } from '../../db/database'
import { isSetupCompleted } from '../../db/repo/settings'
import { forbidden, preconditionRequired, unauthorized, AppError } from '../../lib/errors'
import { resolveSessionUser } from '../../auth/session'
import type { AppBindings } from '../context'
import { env } from '../../env'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function setupGate(db: Db): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    if (isSetupCompleted(db)) return next()
    const path = c.req.path
    if (
      path === '/api/health' ||
      path === '/health' ||
      path === '/api/setup' ||
      path === '/api/setup/' ||
      path === '/api/setup/status'
    ) {
      return next()
    }
    throw preconditionRequired('系统尚未初始化，请先创建管理员账号')
  }
}

export function csrfGuard(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) return next()

    if (c.req.method !== 'DELETE') {
      const contentType = (c.req.header('content-type') ?? '').toLowerCase()
      if (!contentType.includes('application/json')) {
        throw new AppError(415, 'unsupported_media_type', '请求必须使用 application/json')
      }
    }

    const allowed = [env.PUBLIC_BASE_URL, ...env.TRUSTED_ORIGINS]
    const host =
      (env.TRUST_PROXY > 0 ? c.req.header('x-forwarded-host') : undefined) ?? c.req.header('host')
    const sameHost = (value: string): boolean => {
      try {
        return Boolean(host) && new URL(value).host === host
      } catch {
        return false
      }
    }
    const origin = c.req.header('origin')
    if (origin) {
      const normalized = origin.replace(/\/+$/, '')
      if (!allowed.includes(normalized) && !sameHost(normalized)) {
        throw forbidden('请求来源不被允许')
      }
    } else {
      const referer = c.req.header('referer')
      if (
        referer &&
        !allowed.some((item) => referer.startsWith(`${item}/`)) &&
        !sameHost(referer)
      ) {
        throw forbidden('请求来源不被允许')
      }
    }
    return next()
  }
}

export function requireAuth(db: Db): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const user = resolveSessionUser(db, c)
    if (!user) throw unauthorized('登录已过期，请重新登录')
    return next()
  }
}

export function requirePasswordChanged(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw unauthorized()
    if (user.must_change_password === 1) {
      throw new AppError(403, 'password_change_required', '请先修改初始密码')
    }
    return next()
  }
}

export function requireOnboarded(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw unauthorized()
    if (!user.region || !user.language || !user.timezone || !user.onboarded_at) {
      throw new AppError(403, 'onboarding_required', '请先完成初始设置（区域、语言、时区）')
    }
    return next()
  }
}

export function requireAdmin(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw unauthorized()
    if (user.role !== 'admin') throw forbidden('需要管理员权限')
    return next()
  }
}
