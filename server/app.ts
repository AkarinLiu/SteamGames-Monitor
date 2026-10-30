import { existsSync } from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { API_VERSION, APP_NAME, LIMITS } from '../shared/constants'
import { AppError } from './lib/errors'
import { randomId } from './lib/ids'
import { logger } from './lib/logger'
import type { AppBindings } from './api/context'
import type { Runtime } from './runtime'
import { csrfGuard, setupGate } from './api/middleware/guards'
import { createApiRouter } from './api/router'
import { webhookRoutes } from './api/routes/webhooks'
import { isSetupCompleted } from './db/repo/settings'
import { env } from './env'

const startedAt = Date.now()

function safeLogPath(pathname: string): string {
  return pathname
    .replace(/^\/authorize\/[^/]+/, '/authorize/[redacted]')
    .replace(/^\/api\/bot-auth\/[^/]+/, '/api/bot-auth/[redacted]')
    .replace(/^\/api\/bots\/wecom\/qr\/[^/]+/, '/api/bots/wecom/qr/[redacted]')
}

export function createApp(runtime: Runtime): Hono<AppBindings> {
  const app = new Hono<AppBindings>()

  app.use('*', async (c, next) => {
    const incoming = c.req.header('x-request-id')
    const requestId =
      incoming && /^[A-Za-z0-9_.:-]{1,100}$/.test(incoming) ? incoming : randomId(12)
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    c.header('x-content-type-options', 'nosniff')
    c.header('referrer-policy', 'no-referrer')
    c.header('x-frame-options', 'DENY')
    c.header(
      'content-security-policy',
      [
        "default-src 'self'",
        "img-src 'self' data: https://cdn.akamai.steamstatic.com https://shared.akamai.steamstatic.com https://media.steampowered.com https://store.steampowered.com",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
        "font-src 'self' data:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    )
    if (env.PUBLIC_BASE_URL.startsWith('https://')) {
      c.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    }
    await next()
  })

  app.use('*', async (c, next) => {
    const began = Date.now()
    await next()
    if (c.req.path === '/api/health' || c.req.path === '/health') return
    logger.debug('request', {
      method: c.req.method,
      path: safeLogPath(c.req.path),
      status: c.res.status,
      ms: Date.now() - began,
      requestId: c.get('requestId'),
    })
  })

  const health = (c: Context<AppBindings>) => {
    let database = 'ok'
    try {
      runtime.db.prepare('SELECT 1 AS ok').get()
    } catch {
      database = 'error'
    }
    return c.json({
      status: database === 'ok' ? 'ok' : 'degraded',
      name: APP_NAME,
      version: API_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
      database,
      setupRequired: !isSetupCompleted(runtime.db),
    })
  }

  app.get('/api/health', health)
  app.get('/health', health)

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: LIMITS.maxRequestBodyBytes,
      onError: (c) =>
        c.json(
          {
            error: { code: 'payload_too_large', message: '请求体过大' },
            requestId: c.get('requestId'),
          },
          413,
        ),
    }),
  )
  app.use(
    '/webhooks/*',
    bodyLimit({
      maxSize: LIMITS.maxWebhookBodyBytes,
      onError: (c) =>
        c.json(
          {
            error: { code: 'payload_too_large', message: '请求体过大' },
            requestId: c.get('requestId'),
          },
          413,
        ),
    }),
  )
  app.route('/webhooks', webhookRoutes(runtime))
  app.use('/api/*', csrfGuard())
  app.use('/api/*', setupGate(runtime.db))
  app.route('/api', createApiRouter(runtime))

  const spaRoot = path.resolve('dist')
  if (existsSync(path.join(spaRoot, 'index.html'))) {
    app.use('*', serveStatic({ root: spaRoot }))
    app.get(
      '*',
      serveStatic({
        root: spaRoot,
        rewriteRequestPath: (requestPath) =>
          requestPath.startsWith('/api/') ||
          requestPath.startsWith('/webhooks/') ||
          requestPath === '/health'
            ? requestPath
            : '/index.html',
      }),
    )
  }

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/webhooks/')) {
      return c.json(
        {
          error: { code: 'not_found', message: '接口不存在' },
          requestId: c.get('requestId'),
        },
        404,
      )
    }
    return c.text('Not Found', 404)
  })

  app.onError((error, c) => {
    const requestId = c.get('requestId')
    if (error instanceof AppError) {
      if (error.status >= 500) {
        logger.error(error.message, { requestId, code: error.code, error })
      }
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          requestId,
        },
        error.status,
      )
    }
    logger.error('unhandled error', {
      requestId,
      method: c.req.method,
      path: c.req.path,
      error,
    })
    return c.json(
      {
        error: { code: 'internal_error', message: '服务器内部错误' },
        requestId,
      },
      500,
    )
  })

  return app
}
