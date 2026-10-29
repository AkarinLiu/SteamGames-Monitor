import { logger } from '../lib/logger'
import type { Db } from '../db/database'
import { listDueMonitors } from '../db/repo/monitors'
import { findUserById } from '../db/repo/users'
import type { MonitorRow, UserRow } from '../db/rows'
import { fetchAppDetails } from '../steam/appdetails'
import type { AppDetailsResult } from '../steam/types'
import type { SteamRateLimiter } from './rateLimiter'
import { applyCheckError, applyFetchResult, type CheckContext, type CheckOutcome } from './checkMonitor'

const log = logger.child('scheduler')

export interface SchedulerOptions {
  tickMs?: number
  batchSize?: number
  concurrency?: number
  now?: () => number
  cacheTtlMs?: number
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking = false
  private stopped = false
  private readonly inflightKeys = new Set<string>()
  private readonly tasks = new Set<Promise<void>>()
  private readonly ctx: CheckContext

  constructor(
    private readonly db: Db,
    limiter: SteamRateLimiter,
    private readonly options: SchedulerOptions = {},
  ) {
    this.ctx = {
      db,
      limiter,
      now: options.now,
      cacheTtlMs: options.cacheTtlMs,
    }
  }

  get running(): boolean {
    return this.timer !== null && !this.stopped
  }

  get inflightKeyCount(): number {
    return this.inflightKeys.size
  }

  start(): void {
    if (this.timer || this.stopped) return
    const tickMs = this.options.tickMs ?? 1000
    this.timer = setInterval(() => {
      void this.tick()
    }, tickMs)
    this.timer.unref?.()
    void this.tick()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000))
    await Promise.race([Promise.allSettled(this.tasks).then(() => undefined), timeout])
  }

  async tick(): Promise<CheckOutcome[]> {
    if (this.ticking || this.stopped) return []
    this.ticking = true
    const outcomes: CheckOutcome[] = []
    try {
      const now = (this.options.now ?? Date.now)()
      const concurrency = this.options.concurrency ?? 4
      if (this.tasks.size >= concurrency) return outcomes

      const due = listDueMonitors(this.db, now, this.options.batchSize ?? 50)
      if (due.length === 0) return outcomes

      const groups = new Map<string, MonitorRow[]>()
      for (const monitor of due) {
        const key = `${monitor.appid}:${monitor.region}:${monitor.language}`
        const list = groups.get(key)
        if (list) list.push(monitor)
        else groups.set(key, [monitor])
      }

      for (const [key, monitors] of groups) {
        if (this.inflightKeys.has(key)) continue
        if (this.tasks.size >= concurrency) break
        this.inflightKeys.add(key)
        const task = this.processGroup(key, monitors, now)
          .then((results) => {
            outcomes.push(...results)
          })
          .catch((error) => {
            log.error('分组检查失败', { key, error })
          })
          .finally(() => {
            this.inflightKeys.delete(key)
            this.tasks.delete(task)
          })
        this.tasks.add(task)
      }
      return outcomes
    } finally {
      this.ticking = false
    }
  }

  private async processGroup(
    key: string,
    monitors: MonitorRow[],
    now: number,
  ): Promise<CheckOutcome[]> {
    const first = monitors[0]
    if (!first) return []
    let result: AppDetailsResult | null = null
    let error: unknown = null
    try {
      result = await fetchAppDetails(this.db, first.appid, first.region, first.language, {
        limiter: this.ctx.limiter,
        maxWaitMs: 5_000,
        cacheTtlMs: this.options.cacheTtlMs,
      })
    } catch (fetchError) {
      error = fetchError
    }

    const users = new Map<number, UserRow | undefined>()
    const outcomes: CheckOutcome[] = []
    for (const monitor of monitors) {
      const fresh = this.reload(monitor.id)
      if (!fresh) continue
      let user = users.get(fresh.user_id)
      if (!users.has(fresh.user_id)) {
        user = findUserById(this.db, fresh.user_id)
        users.set(fresh.user_id, user)
      }
      if (!user || user.status !== 'active') continue
      if (error) {
        outcomes.push(applyCheckError(this.ctx, fresh, error, now))
      } else if (result) {
        outcomes.push(
          applyFetchResult(this.ctx, fresh, user, result, { source: 'scheduler', now }),
        )
      }
    }
    if (result?.fromCache) {
      log.debug('使用缓存', { key, monitors: monitors.length })
    }
    return outcomes
  }

  private reload(id: number): MonitorRow | undefined {
    return this.db
      .prepare('SELECT * FROM monitors WHERE id = ? AND deleted_at IS NULL')
      .get(id) as MonitorRow | undefined
  }
}
