import type { Db } from '../../db/database'
import type { MonitorRow } from '../../db/rows'
import { findMonitorByIdInternal, findMonitorByAppid, searchMonitorsByName } from '../../db/repo/monitors'

export type TargetResolution =
  | { kind: 'one'; monitor: MonitorRow }
  | { kind: 'none' }
  | { kind: 'many'; monitors: MonitorRow[] }

export function resolveMonitorTarget(db: Db, userId: number, query: string): TargetResolution {
  const trimmed = query.trim()
  if (!trimmed) return { kind: 'none' }

  if (/^\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed)
    if (Number.isSafeInteger(asNumber) && asNumber > 0) {
      const byId = findMonitorByIdInternal(db, asNumber)
      if (byId && byId.user_id === userId && byId.deleted_at === null) {
        return { kind: 'one', monitor: byId }
      }
      const byAppid = findMonitorByAppid(db, userId, asNumber)
      if (byAppid && byAppid.deleted_at === null) {
        return { kind: 'one', monitor: byAppid }
      }
    }
    return { kind: 'none' }
  }

  const matches = searchMonitorsByName(db, userId, trimmed, 5)
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length === 1) return { kind: 'one', monitor: matches[0]! }
  return { kind: 'many', monitors: matches }
}
