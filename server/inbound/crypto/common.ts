import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto'

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

export function hmacSha256Base64(key: string | Buffer, message: string): string {
  return createHmac('sha256', key).update(message).digest('base64')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function pkcs7Unpad(buffer: Buffer, blockSize: number): Buffer {
  if (buffer.length === 0) throw new Error('空密文')
  const pad = buffer[buffer.length - 1] ?? 0
  if (pad < 1 || pad > blockSize || pad > buffer.length) throw new Error('无效的填充')
  for (let index = buffer.length - pad; index < buffer.length; index += 1) {
    if (buffer[index] !== pad) throw new Error('无效的填充')
  }
  return buffer.subarray(0, buffer.length - pad)
}

export function decryptAesCbc(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  unpadBlockSize: number | null,
): Buffer {
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  if (unpadBlockSize !== null) decipher.setAutoPadding(false)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return unpadBlockSize === null ? plain : pkcs7Unpad(plain, unpadBlockSize)
}
