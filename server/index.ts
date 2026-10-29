import { initSystemCa } from './lib/tls'

initSystemCa()

import { serve } from '@hono/node-server'
import { createApp } from './app'
import { env } from './env'
import { logger } from './lib/logger'
import { createRuntime } from './runtime'

const log = logger.child('server')
const runtime = createRuntime()

const app = createApp(runtime)

const server = serve(
  {
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
  },
  (info) => {
    log.info('listening', {
      address: `${info.address}:${info.port}`,
      env: env.NODE_ENV,
      publicBaseUrl: env.PUBLIC_BASE_URL,
    })
  },
)

let shuttingDown = false

function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  log.info('shutting down', { signal })
  const force = setTimeout(() => {
    log.warn('forced exit after shutdown timeout')
    process.exit(1)
  }, 20_000)
  force.unref()
  server.close((error) => {
    if (error) {
      log.error('error while closing server', { error })
    }
    clearTimeout(force)
    void runtime.close().finally(() => {
      process.exit(error ? 1 : 0)
    })
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', { error: reason })
})
process.on('uncaughtException', (error) => {
  log.error('uncaught exception', { error })
  shutdown('uncaughtException')
})
