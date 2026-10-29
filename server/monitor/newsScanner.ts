import { DEFAULT_NEWS_KEYWORDS } from '../../shared/constants'
import type { NewsMatchMode } from '../../shared/types'
import { safeJsonParse } from '../../shared/utils'
import type { Db } from '../db/database'
import type { MonitorRow } from '../db/rows'
import { findUserById } from '../db/repo/users'
import { listDueNewsMonitors, updateMonitor } from '../db/repo/monitors'
import { createEvent } from '../db/repo/events'
import { attachNewsEvent, recordNewsSeen } from '../db/repo/news'
import { enqueueEventDeliveries } from '../notify/dispatcher'
import { fetchNews } from '../steam/news'
import type { SteamNewsItem } from '../steam/types'
import type { SteamRateLimiter } from './rateLimiter'
import { computeNextNewsCheckAt, jitterMs } from './policies'
import { logger } from '../lib/logger'

const log = logger.child('news')

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
const FUTURE_TOLERANCE_MS = 5 * 60_000

export interface NewsScannerOptions {
  intervalMs?: number
  batchSize?: number
  now?: () => number
}

export interface NewsScanResult {
  scanned: number
  matched: number
  eventsCreated: number
}

export class NewsScanner {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private stopped = false

  constructor(
    private readonly db: Db,
    private readonly limiter: SteamRateLimiter,
    private readonly options: NewsScannerOptions = {},
  ) {}

  get isRunning(): boolean {
    return this.timer !== null && !this.stopped
  }

  start(): void {
    if (this.timer || this.stopped) return
    this.timer = setInterval(() => {
      void this.tick()
    }, this.options.intervalMs ?? 60_000)
    this.timer.unref?.()
    void this.tick()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async tick(): Promise<NewsScanResult> {
    const result: NewsScanResult = { scanned: 0, matched: 0, eventsCreated: 0 }
    if (this.running || this.stopped) return result
    this.running = true
    try {
      const now = (this.options.now ?? Date.now)()
      const monitors = listDueNewsMonitors(this.db, now, this.options.batchSize ?? 20)
      if (monitors.length === 0) return result

      const byAppid = new Map<number, MonitorRow[]>()
      for (const monitor of monitors) {
        const list = byAppid.get(monitor.appid)
        if (list) list.push(monitor)
        else byAppid.set(monitor.appid, [monitor])
      }

      for (const [appid, list] of byAppid) {
        let items: SteamNewsItem[] = []
        let failed = false
        try {
          const news = await fetchNews(this.db, appid, {
            limiter: this.limiter,
            now: () => now,
          })
          items = news.items
        } catch (error) {
          failed = true
          log.debug('新闻获取失败', {
            appid,
            code: (error as { code?: string })?.code ?? 'unknown',
          })
        }

        for (const monitor of list) {
          const outcome = this.scanMonitor(monitor, items, now, failed)
          result.scanned += 1
          result.matched += outcome.matched
          result.eventsCreated += outcome.eventsCreated
        }
      }
      return result
    } finally {
      this.running = false
    }
  }

  private scanMonitor(
    monitor: MonitorRow,
    items: SteamNewsItem[],
    now: number,
    failed: boolean,
  ): { matched: number; eventsCreated: number } {
    const db = this.db
    const user = findUserById(db, monitor.user_id)
    if (!user || user.status !== 'active') return { matched: 0, eventsCreated: 0 }

    const nextNewsCheckAt = failed
      ? now + jitterMs(60 * 60_000, 0.2)
      : computeNextNewsCheckAt(now)

    if (failed) {
      updateMonitor(db, monitor.id, { nextNewsCheckAt })
      return { matched: 0, eventsCreated: 0 }
    }

    const keywords = safeJsonParse<string[]>(user.news_keywords_json, DEFAULT_NEWS_KEYWORDS)
    const matchMode = user.news_match_mode as NewsMatchMode
    const earliest = Math.max(Number(monitor.created_at), now - MAX_AGE_MS)
    let matched = 0
    let eventsCreated = 0

    for (const item of items) {
      if (!item.date || item.date < earliest || item.date > now + FUTURE_TOLERANCE_MS) continue
      const keyword = findKeyword(item, keywords, matchMode)
      if (!keyword) continue
      matched += 1

      db.transaction(() => {
        const seen = recordNewsSeen(db, {
          monitorId: monitor.id,
          gid: item.gid,
          title: item.title,
          url: item.url,
          publishedAt: item.date,
          matchedKeyword: keyword,
          seenAt: now,
        })
        if (!seen) return

        const { event, created } = createEvent(db, {
          monitorId: monitor.id,
          userId: monitor.user_id,
          type: 'delisting_warning',
          severity: 'warning',
          payload: {
            monitorId: monitor.id,
            appid: monitor.appid,
            name: monitor.name,
            kind: monitor.kind,
            storeUrl: monitor.store_url,
            region: monitor.region,
            gid: item.gid,
            title: item.title,
            url: item.url,
            matchedKeyword: keyword,
            publishedAt: item.date,
            feedName: item.feedName,
            heuristic: true,
          },
          dedupeKey: `news:${monitor.id}:${item.gid}`,
          source: 'steam-news',
          createdAt: now,
        })
        if (!created) return
        attachNewsEvent(db, monitor.id, item.gid, event.id)
        eventsCreated += 1
        enqueueEventDeliveries(db, event)
      })
    }

    updateMonitor(db, monitor.id, { nextNewsCheckAt })
    return { matched, eventsCreated }
  }
}

function findKeyword(
  item: SteamNewsItem,
  keywords: string[],
  mode: NewsMatchMode,
): string | null {
  const haystack = (mode === 'title' ? item.title : `${item.title}\n${item.contents}`).toLowerCase()
  if (!haystack) return null
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase()
    if (needle && haystack.includes(needle)) return keyword
  }
  return null
}
