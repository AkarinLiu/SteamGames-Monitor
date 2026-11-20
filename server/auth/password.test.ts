import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword } from './password'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%'

describe('generateTemporaryPassword', () => {
  it('returns an 18-character password from the allowed alphabet', () => {
    for (let i = 0; i < 20; i += 1) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(18)
      for (const char of password) expect(ALPHABET).toContain(char)
    }
  })
})
