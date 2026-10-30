import type { Db } from '../db/database'
import { slugExists } from '../db/repo/bots'
import { randomId, slugify } from './ids'

export function generateBotSlug(db: Db, name: string): string {
  const base = slugify(name) || 'bot'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = `${base}-${randomId(6)}`
    if (!slugExists(db, slug)) return slug
  }
  return `${base}-${randomId(12)}`
}
