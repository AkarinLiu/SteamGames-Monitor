import { Hono } from 'hono'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { findBotBySlug } from '../../db/repo/bots'
import { decryptConfig, botAad, SecretDecryptError } from '../../notify/secrets'
import { logger } from '../../lib/logger'
import type { BotConfig, DingtalkBotConfig, FeishuBotConfig } from '../../inbound/types'
import { handleFeishuUpdate } from '../../inbound/platforms/feishu'
import { handleDingtalkUpdate } from '../../inbound/platforms/dingtalk'

const log = logger.child('webhook')

function headersRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value
  })
  return record
}

export function webhookRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  const loadBot = (slug: string) => {
    const bot = findBotBySlug(db, slug)
    if (!bot || bot.enabled !== 1) return null
    try {
      const config = decryptConfig<BotConfig>(bot.config_enc, botAad(bot.user_id, bot.platform))
      return { bot, config }
    } catch (error) {
      if (error instanceof SecretDecryptError) {
        log.warn('机器人凭据解密失败', { botId: bot.id })
        return null
      }
      throw error
    }
  }

  router.post('/feishu/:slug', async (c) => {
    const loaded = loadBot(c.req.param('slug'))
    if (!loaded) return c.json({ error: 'not found' }, 404)
    const rawBody = await c.req.text()
    const result = handleFeishuUpdate({
      bot: loaded.bot,
      config: loaded.config as FeishuBotConfig,
      headers: headersRecord(c.req.raw.headers),
      rawBody,
    })
    if (result.kind === 'challenge') return c.json(result.body as Record<string, unknown>)
    if (result.kind === 'event') {
      await runtime.dispatcher.accept(result.event)
      return c.json({ ok: true })
    }
    if (result.kind === 'ignored') return c.json({ ok: true })
    if (result.kind === 'error') return c.json({ error: result.message }, result.status as 400 | 401)
    return c.json({ error: 'invalid' }, 400)
  })

  router.post('/dingtalk/:slug', async (c) => {
    const loaded = loadBot(c.req.param('slug'))
    if (!loaded) return c.json({ error: 'not found' }, 404)
    const rawBody = await c.req.text()
    const headers = headersRecord(c.req.raw.headers)
    const result = handleDingtalkUpdate({
      bot: loaded.bot,
      config: loaded.config as DingtalkBotConfig,
      headers,
      rawBody,
    })
    if (result.kind === 'event') {
      await runtime.dispatcher.accept(result.event)
      return c.json({})
    }
    if (result.kind === 'ignored') return c.json({})
    if (result.kind === 'error') return c.json({ error: result.message }, result.status as 400 | 401)
    return c.json({ error: 'invalid' }, 400)
  })

  return router
}
