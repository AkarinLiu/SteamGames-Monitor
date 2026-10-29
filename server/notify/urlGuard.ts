import { isIP } from 'node:net'
import { env } from '../env'
import { badRequest } from '../lib/errors'

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  const [a = 0, b = 0] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')) return true
  if (normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length))
  }
  return false
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    !host.includes('.')
  )
}

export function assertSafeOutboundUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw badRequest('请输入有效的 Webhook URL')
  }

  const allowInsecure = env.ALLOW_INSECURE_WEBHOOKS
  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:')) {
    throw badRequest('Webhook 必须使用 HTTPS')
  }

  const hostname = url.hostname
  const ipVersion = isIP(hostname)
  const privateHost =
    ipVersion === 4
      ? isPrivateIpv4(hostname)
      : ipVersion === 6
        ? isPrivateIpv6(hostname)
        : isLocalHostname(hostname)

  if (privateHost && !allowInsecure) {
    throw badRequest('Webhook 地址不能指向本机或内网地址')
  }

  return url
}
