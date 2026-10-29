import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'
import { env } from '../env'

const KEY_VERSION = 1
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const SALT = 'steam-games-monitor'
const INFO = 'notification-secrets'

function deriveKey(version: number): Buffer {
  const derived = hkdfSync(
    'sha256',
    env.APP_SECRET,
    `${SALT}:v${version}`,
    INFO,
    32,
  )
  return Buffer.from(derived)
}

const keyCache = new Map<number, Buffer>()

function keyFor(version: number): Buffer {
  const cached = keyCache.get(version)
  if (cached) return cached
  const key = deriveKey(version)
  keyCache.set(version, key)
  return key
}

export function currentKeyVersion(): number {
  return KEY_VERSION
}

export function encryptSecret(plaintext: string, aad: string): string {
  const key = keyFor(KEY_VERSION)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'v1',
    String(KEY_VERSION),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join('.')
}

export class SecretDecryptError extends Error {
  constructor(message = '无法解密已保存的密钥，请重新填写') {
    super(message)
    this.name = 'SecretDecryptError'
  }
}

export function decryptSecret(payload: string, aad: string): string {
  const parts = payload.split('.')
  if (parts.length !== 5 || parts[0] !== 'v1') {
    throw new SecretDecryptError()
  }
  const version = Number(parts[1])
  if (!Number.isSafeInteger(version) || version <= 0) throw new SecretDecryptError()
  try {
    const iv = Buffer.from(parts[2]!, 'base64url')
    const tag = Buffer.from(parts[3]!, 'base64url')
    const data = Buffer.from(parts[4]!, 'base64url')
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretDecryptError()
    const decipher = createDecipheriv(ALGORITHM, keyFor(version), iv)
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch (error) {
    if (error instanceof SecretDecryptError) throw error
    throw new SecretDecryptError()
  }
}

export function encryptConfig(value: Record<string, unknown>, aad: string): string {
  return encryptSecret(JSON.stringify(value), aad)
}

export function decryptConfig<T>(payload: string, aad: string): T {
  const text = decryptSecret(payload, aad)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new SecretDecryptError('存储的配置已损坏，请重新填写')
  }
}

export function channelAad(userId: number, type: string): string {
  return `channel:${userId}:${type}`
}

export function botAad(userId: number, platform: string): string {
  return `bot:${userId}:${platform}`
}
