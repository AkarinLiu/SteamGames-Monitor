import type { Db } from '../db/database'
import { getRetention } from '../db/repo/settings'
import { purgeSnapshots } from '../db/repo/snapshots'
import { purgeEvents } from '../db/repo/events'
import { purgeTerminalDeliveries } from '../db/repo/deliveries'
import { purgeInboundMessages, purgeCommandLogs, purgeCommandContexts } from '../db/repo/inbound'
import { purgeAuditLogs } from '../db/repo/audit'
import { purgeBotAuthRequests } from '../db/repo/botAuthRequests'
import { purgeNewsSeen } from '../db/repo/news'
import { purgeExpiredSessions } from '../db/repo/sessions'
import { purgeSteamCache, purgeNewsCache } from '../db/repo/caches'
import { logger } from '../lib/logger'

const log = logger.child('cleanup')
const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_RETENTION_MS = 7 * DAY_MS
const CHECKPOINT_INTERVAL_MS = 7 * DAY_MS

export interface CleanupReport {
  snapshots: number
  events: number
  deliveries: number
  inbound: number
  commandLogs: number
  auditLogs: number
  botAuthRequests: number
  newsSeen: number
  sessions: number
  steamCache: number
  newsCache: number
}

export class CleanupJob {
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private lastCheckpointAt = 0

  constructor(
    private readonly db: Db,
    private readonly options: { intervalMs?: number; now?: () => number } = {},
  ) {}

  start(): void {
    if (this.timer || this.stopped) return
    this.timer = setInterval(() => {
      void this.runOnce()
    }, this.options.intervalMs ?? 60 * 60_000)
    this.timer.unref?.()
    void this.runOnce()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  runOnce(): CleanupReport {
    const now = (this.options.now ?? Date.now)()
    const retention = getRetention(this.db)
    const report: CleanupReport = {
      snapshots: purgeSnapshots(this.db, now - retention.snapshotsDays * DAY_MS),
      events: purgeEvents(this.db, now - retention.eventsDays * DAY_MS),
      deliveries: purgeTerminalDeliveries(this.db, now - retention.deliveriesDays * DAY_MS),
      inbound: purgeInboundMessages(this.db, now - retention.inboundDays * DAY_MS),
      commandLogs: purgeCommandLogs(this.db, now - retention.logsDays * DAY_MS),
      auditLogs: purgeAuditLogs(this.db, now - retention.logsDays * DAY_MS),
      botAuthRequests: purgeBotAuthRequests(this.db, now - 30 * DAY_MS),
      newsSeen: purgeNewsSeen(this.db, now - retention.newsSeenDays * DAY_MS),
      sessions: purgeExpiredSessions(this.db, now),
      steamCache: purgeSteamCache(this.db, now - CACHE_RETENTION_MS),
      newsCache: purgeNewsCache(this.db, now - CACHE_RETENTION_MS),
    }
    purgeCommandContexts(this.db, now)

    const total = Object.values(report).reduce((sum, value) => sum + value, 0)
    if (total > 0) log.info('清理完成', { ...report } as Record<string, number>)

    if (now - this.lastCheckpointAt >= CHECKPOINT_INTERVAL_MS) {
      try {
        this.db.checkpoint('TRUNCATE')
        this.lastCheckpointAt = now
      } catch (error) {
        log.warn('WAL checkpoint 失败', { error })
      }
    }
    return report
  }
}
