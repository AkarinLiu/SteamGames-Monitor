import { env } from './env'
import { openDatabase, type Db } from './db/database'
import { LoginService } from './auth/login'
import { requeueStuckDeliveries } from './db/repo/deliveries'
import { purgeExpiredSessions } from './db/repo/sessions'
import { purgeCommandContexts } from './db/repo/inbound'
import { getSystemSettings } from './db/repo/settings'
import { SteamRateLimiter } from './monitor/rateLimiter'
import { Scheduler } from './monitor/scheduler'
import { NewsScanner } from './monitor/newsScanner'
import { DeliveryWorker } from './notify/deliveryWorker'
import { CleanupJob } from './jobs/cleanup'
import {
  runMonitorCheck,
  type CheckOptions,
  type CheckOutcome,
} from './monitor/checkMonitor'
import { InboundDispatcher } from './inbound/dispatcher'
import { sendCommandDelivery } from './inbound/reply'
import type { CommandServices } from './inbound/commands/executor'

export interface Runtime {
  db: Db
  startedAt: number
  loginService: LoginService
  limiter: SteamRateLimiter
  scheduler: Scheduler
  newsScanner: NewsScanner
  deliveryWorker: DeliveryWorker
  dispatcher: InboundDispatcher
  cacheTtlMs: number
  cleanup: CleanupJob
  checkMonitor: (monitorId: number, options?: CheckOptions) => Promise<CheckOutcome>
  close: () => Promise<void>
}

export function createRuntime(): Runtime {
  const db = openDatabase(env.DATABASE_PATH)
  const now = Date.now()
  requeueStuckDeliveries(db, now)
  purgeExpiredSessions(db, now)
  purgeCommandContexts(db, now)
  const loginService = new LoginService()
  const limiter = new SteamRateLimiter()
  const systemSettings = getSystemSettings(db, env.MAX_TOTAL_MONITORS)
  const scheduler = new Scheduler(db, limiter, {
    cacheTtlMs: systemSettings.cacheTtlSeconds * 1000,
  })
  const newsScanner = new NewsScanner(db, limiter)
  const deliveryWorker = new DeliveryWorker(db)
  const cleanup = new CleanupJob(db)
  const cacheTtlMs = systemSettings.cacheTtlSeconds * 1000

  const checkMonitor = (monitorId: number, options?: CheckOptions) =>
    runMonitorCheck({ db, limiter, cacheTtlMs }, monitorId, options)

  const services: CommandServices = {
    db,
    limiter,
    cacheTtlMs,
    maxTotalMonitors: env.MAX_TOTAL_MONITORS,
    checkMonitor,
  }
  const dispatcher = new InboundDispatcher({ db, services })

  deliveryWorker.setCommandSender((delivery) => sendCommandDelivery(db, delivery))

  scheduler.start()
  newsScanner.start()
  deliveryWorker.start()
  cleanup.start()

  return {
    db,
    startedAt: now,
    loginService,
    limiter,
    scheduler,
    newsScanner,
    deliveryWorker,
    dispatcher,
    cacheTtlMs,
    cleanup,
    checkMonitor,
    close: async () => {
      await scheduler.stop()
      newsScanner.stop()
      await deliveryWorker.stop()
      cleanup.stop()
      db.checkpoint('TRUNCATE')
      db.close()
    },
  }
}
