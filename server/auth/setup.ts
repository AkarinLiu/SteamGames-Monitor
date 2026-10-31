import type { SetupInput } from '../../shared/schemas'
import { DEFAULT_NEWS_KEYWORDS, LIMITS } from '../../shared/constants'
import type { Db } from '../db/database'
import { conflict } from '../lib/errors'
import { countUsers, createUser, findUserById, updateUser } from '../db/repo/users'
import { isSetupCompleted, setSetupCompleted } from '../db/repo/settings'
import { writeAudit } from '../db/repo/audit'
import { hashPassword } from './password'
import type { UserRow } from '../db/rows'

export async function completeSetup(
  db: Db,
  input: SetupInput,
  ip: string | null,
): Promise<UserRow> {
  if (isSetupCompleted(db) || countUsers(db) > 0) {
    throw conflict('系统已经完成初始化')
  }
  const passwordHash = await hashPassword(input.password)
  return db.transaction(() => {
    if (isSetupCompleted(db) || countUsers(db) > 0) {
      throw conflict('系统已经完成初始化')
    }
    const now = Date.now()
    const user = createUser(db, {
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      role: 'admin',
      region: input.region,
      language: input.language,
      timezone: input.timezone,
      uiLocale: input.uiLocale,
      mustChangePassword: false,
      onboardedAt: now,
    })
    updateUser(db, user.id, {
      pollIntervalSeconds: input.pollIntervalSeconds ?? LIMITS.defaultPollIntervalSeconds,
      minDiscountPercent: input.minDiscountPercent ?? LIMITS.defaultMinDiscountPercent,
      newsKeywords: input.newsKeywords ?? DEFAULT_NEWS_KEYWORDS,
      newsMatchMode: input.newsMatchMode ?? 'title',
    })
    setSetupCompleted(db, true)
    writeAudit(db, {
      actorUserId: user.id,
      action: 'setup.complete',
      target: `user:${user.id}`,
      detail: { username: user.username },
      ip,
    })
    return findUserById(db, user.id) as UserRow
  })
}
