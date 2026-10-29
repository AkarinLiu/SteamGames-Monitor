import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { env } from '../env'

export function getClientIp(c: Context): string {
  if (env.TRUST_PROXY > 0) {
    const forwarded = c.req.header('x-forwarded-for')
    if (forwarded) {
      const parts = forwarded
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      if (parts.length > 0) {
        const index = Math.max(0, parts.length - env.TRUST_PROXY)
        return parts[index] ?? parts[parts.length - 1] ?? 'unknown'
      }
    }
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function getUserAgent(c: Context): string | null {
  const value = c.req.header('user-agent')
  if (!value) return null
  return value.slice(0, 300)
}
