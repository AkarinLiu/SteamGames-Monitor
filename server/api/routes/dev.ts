import { Hono } from 'hono'
import { DevCommandSchema } from '../../../shared/schemas'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseJson } from '../respond'
import { env } from '../../env'
import { findBotBySlug } from '../../db/repo/bots'
import { notFound, unauthorized } from '../../lib/errors'
import type { BotPlatform } from '../../../shared/types'
import type { InboundEvent, ReplyTarget } from '../../inbound/types'

function replyTarget(platform: BotPlatform, chatId: string, platformUserId: string): ReplyTarget {
  if (platform === 'feishu') return { type: 'feishu', messageId: 'dev', chatId }
  if (platform === 'dingtalk') {
    return {
      type: 'dingtalk',
      sessionWebhook: '',
      expiresAt: 0,
      userId: platformUserId,
      robotCode: null,
    }
  }
  return { type: 'wecom', toUser: platformUserId }
}

export function devRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()

  router.post('/command', async (c) => {
    const enabled = env.ENABLE_DEV_COMMANDS || !env.isProduction
    if (!enabled) throw notFound('接口不存在')
    if (env.DEV_COMMAND_TOKEN) {
      const token = c.req.header('x-dev-token')
      if (token !== env.DEV_COMMAND_TOKEN) throw unauthorized('X-Dev-Token 无效')
    }

    const input = await parseJson(c, DevCommandSchema)
    const bot = findBotBySlug(runtime.db, input.botSlug)
    if (!bot || !bot.enabled) throw notFound('机器人不存在或已停用')
    if (bot.platform !== input.platform) throw notFound('机器人平台不匹配')

    const now = Date.now()
    const event: InboundEvent = {
      platform: input.platform,
      botApp: bot,
      ownerUserId: bot.user_id,
      platformMessageId: `dev-${now}-${Math.random().toString(36).slice(2, 8)}`,
      chatId: input.chatId,
      platformUserId: input.platformUserId,
      userName: input.userName ?? null,
      text: input.text,
      reply: replyTarget(input.platform, input.chatId, input.platformUserId),
      receivedAt: now,
    }
    const lines = await runtime.dispatcher.handleInline(event)
    return c.json({ lines })
  })

  return router
}
