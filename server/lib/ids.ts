import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function randomId(bytes = 12): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

export function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
