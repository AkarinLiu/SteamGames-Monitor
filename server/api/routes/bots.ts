import { Hono } from 'hono'
import {
  BOT_CONFIG_SCHEMAS,
  CreateBotSchema,
  AllowlistEntrySchema,
  UpdateBotSchema,
  WecomQrStartSchema,
} from '../../../shared/schemas'
import type { BotPlatform } from '../../../shared/types'
import { LIMITS } from '../../../shared/constants'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseIdParam, parseJson, parseWith } from '../respond'
import { requireAuth, requirePasswordChanged } from '../middleware/guards'
import { conflict, notFound, badRequest } from '../../lib/errors'
import type { AllowlistRow, BotAppRow, UserRow } from '../../db/rows'
import { toBotApp } from '../../db/rows'
import {
  countBotsForUser,
  createBot,
  deleteAllowlistEntry,
  deleteBot,
  findBotById,
  isSlugConflict,
  listAllowlist,
  listBots,
  updateBot,
  upsertAllowlistEntry,
} from '../../db/repo/bots'
import { botAad, currentKeyVersion, decryptConfig, encryptConfig, SecretDecryptError } from '../../notify/secrets'
import { generateBotSlug } from '../../lib/botSlug'
import { env } from '../../env'
import type { BotConfig } from '../../inbound/types'

function configSummary(platform: BotPlatform, config: BotConfig): Record<string, unknown> {
  if (platform === 'feishu') {
    const feishu = config as Record<string, unknown>
    return {
      appId: feishu.appId ?? '',
      appSecretSet: Boolean(feishu.appSecret),
      encryptKeySet: Boolean(feishu.encryptKey),
      verificationTokenSet: Boolean(feishu.verificationToken),
      ownerPlatformUserId: feishu.ownerPlatformUserId ?? '',
    }
  }
  if (platform === 'dingtalk') {
    const dingtalk = config as Record<string, unknown>
    return {
      appSecretSet: Boolean(dingtalk.appSecret),
      robotCode: dingtalk.robotCode ?? '',
      ownerPlatformUserId: dingtalk.ownerPlatformUserId ?? '',
    }
  }
  const wecom = config as Record<string, unknown>
  return {
    botId: wecom.botId ?? '',
    secretSet: Boolean(wecom.secret),
    ownerPlatformUserId: wecom.ownerPlatformUserId ?? '',
  }
}

function toBotView(
  runtime: Runtime,
  row: BotAppRow,
  allowlist: AllowlistRow[],
): Record<string, unknown> {
  const bot = toBotApp(row, allowlist.map((entry) => ({
    id: entry.id,
    botAppId: entry.bot_app_id,
    platformUserId: entry.platform_user_id,
    displayName: entry.display_name,
    role: entry.role as 'admin' | 'viewer',
    createdAt: entry.created_at,
  })))
  let config: Record<string, unknown> = {}
  let configError: string | undefined
  try {
    config = configSummary(
      row.platform as BotPlatform,
      decryptConfig<BotConfig>(row.config_enc, botAad(row.user_id, row.platform)),
    )
  } catch (error) {
    if (!(error instanceof SecretDecryptError)) throw error
    configError = error.message
  }
  const isWebhookBot = row.platform !== 'wecom'
  return {
    ...bot,
    config,
    configError,
    webhookPath: isWebhookBot ? `/webhooks/${row.platform}/${row.webhook_slug}` : null,
    callbackUrl: isWebhookBot
      ? `${env.PUBLIC_BASE_URL}/webhooks/${row.platform}/${row.webhook_slug}`
      : null,
    connection:
      row.platform === 'wecom'
        ? row.enabled === 1
          ? runtime.wecomBots.statusFor(row.id)
          : { state: 'disabled', since: row.updated_at }
        : null,
  }
}

function parseBotConfig(platform: BotPlatform, input: unknown): Record<string, unknown> {
  switch (platform) {
    case 'feishu':
      return parseWith(BOT_CONFIG_SCHEMAS.feishu, input)
    case 'dingtalk':
      return parseWith(BOT_CONFIG_SCHEMAS.dingtalk, input)
    case 'wecom':
      return parseWith(BOT_CONFIG_SCHEMAS.wecom, input)
    default:
      throw badRequest('未知的机器人平台')
  }
}

const BOT_STRING_KEYS = [
  'secret',
  'appId',
  'appSecret',
  'encryptKey',
  'verificationToken',
  'robotCode',
  'botId',
  'ownerPlatformUserId',
] as const

function mergeBotConfig(
  existing: Record<string, unknown>,
  input: Record<string, unknown>,
  replaceSecret: boolean,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing }
  for (const key of BOT_STRING_KEYS) {
    if (!(key in input)) continue
    const value = input[key]
    if (value === undefined) continue
    if (typeof value === 'string' && value === '' && !replaceSecret) continue
    merged[key] = value
  }
  return merged
}

export function botRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.use('*', requireAuth(db), requirePasswordChanged())

  router.get('/', (c) => {
    const user = c.get('user') as UserRow
    const rows = listBots(db, user.id)
    return c.json({
      items: rows.map((row) => toBotView(runtime, row, listAllowlist(db, row.id))),
      quota: { used: rows.length, limit: LIMITS.maxBotsPerUser },
    })
  })

  router.post('/wecom/qr', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, WecomQrStartSchema)
    const session = await runtime.wecomQr.start(user.id, input.name)
    c.header('cache-control', 'no-store')
    return c.json(session, 201)
  })

  router.get('/wecom/qr/:sessionId', async (c) => {
    const user = c.get('user') as UserRow
    const result = await runtime.wecomQr.poll(user.id, c.req.param('sessionId'))
    if (result.status === 'success' && result.botId) runtime.wecomBots.sync()
    c.header('cache-control', 'no-store')
    return c.json(result)
  })

  router.delete('/wecom/qr/:sessionId', (c) => {
    const user = c.get('user') as UserRow
    runtime.wecomQr.cancel(user.id, c.req.param('sessionId'))
    return c.json({ ok: true })
  })

  router.post('/', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, CreateBotSchema)
    if (countBotsForUser(db, user.id) >= LIMITS.maxBotsPerUser) {
      throw conflict(`每个账号最多创建 ${LIMITS.maxBotsPerUser} 个机器人`)
    }
    const config = parseBotConfig(input.platform, input.config)
    if (input.enabled) {
      const existing = db
        .prepare(
          'SELECT id FROM bot_apps WHERE user_id = ? AND platform = ? AND enabled = 1',
        )
        .get(user.id, input.platform)
      if (existing) throw conflict('该平台已有一个启用的机器人，请先停用旧机器人')
    }
    try {
      const row = createBot(db, {
        userId: user.id,
        platform: input.platform,
        name: input.name,
        webhookSlug: generateBotSlug(db, input.name),
        enabled: input.enabled,
        configEnc: encryptConfig(config, botAad(user.id, input.platform)),
        keyVersion: currentKeyVersion(),
        apiBaseUrl: input.apiBaseUrl ?? null,
      })
      if (input.platform === 'wecom') runtime.wecomBots.sync()
      return c.json({ bot: toBotView(runtime, row, []) }, 201)
    } catch (error) {
      if (isSlugConflict(error)) throw conflict('回调地址冲突，请重试')
      throw error
    }
  })

  router.patch('/:id', async (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findBotById(db, user.id, id)
    if (!row) throw notFound('机器人不存在')
    const input = await parseJson(c, UpdateBotSchema)

    if (input.enabled === true && row.enabled !== 1) {
      const existing = db
        .prepare('SELECT id FROM bot_apps WHERE user_id = ? AND platform = ? AND enabled = 1 AND id != ?')
        .get(user.id, row.platform, row.id)
      if (existing) throw conflict('该平台已有一个启用的机器人，请先停用旧机器人')
    }

    let configEnc: string | undefined
    if (input.config) {
      let existing: Record<string, unknown> = {}
      try {
        existing = decryptConfig<Record<string, unknown>>(row.config_enc, botAad(row.user_id, row.platform))
      } catch (error) {
        if (!(error instanceof SecretDecryptError)) throw error
      }
      const merged = mergeBotConfig(existing, input.config, input.replaceSecret === true)
      const validated = parseBotConfig(row.platform as BotPlatform, merged)
      configEnc = encryptConfig(validated, botAad(row.user_id, row.platform))
    }

    const updated = updateBot(db, id, {
      name: input.name,
      enabled: input.enabled,
      apiBaseUrl: input.apiBaseUrl,
      configEnc,
      keyVersion: configEnc ? currentKeyVersion() : undefined,
    })
    if (row.platform === 'wecom') runtime.wecomBots.sync()
    return c.json({ bot: toBotView(runtime, updated!, listAllowlist(db, id)) })
  })

  router.delete('/:id', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    if (!deleteBot(db, user.id, id)) throw notFound('机器人不存在')
    runtime.wecomBots.sync()
    return c.json({ ok: true })
  })

  router.post('/:id/allowlist', async (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findBotById(db, user.id, id)
    if (!row) throw notFound('机器人不存在')
    const input = await parseJson(c, AllowlistEntrySchema)
    const entry = upsertAllowlistEntry(db, id, input.platformUserId, input.displayName ?? null, input.role)
    return c.json({
      entry: {
        id: entry.id,
        platformUserId: entry.platform_user_id,
        displayName: entry.display_name,
        role: entry.role,
        createdAt: entry.created_at,
      },
    })
  })

  router.delete('/:id/allowlist/:platformUserId', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findBotById(db, user.id, id)
    if (!row) throw notFound('机器人不存在')
    const platformUserId = decodeURIComponent(c.req.param('platformUserId'))
    if (!deleteAllowlistEntry(db, id, platformUserId)) throw notFound('允许名单条目不存在')
    return c.json({ ok: true })
  })

  router.post('/:id/test-inbound', async (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findBotById(db, user.id, id)
    if (!row) throw notFound('机器人不存在')
    const body = (await c.req.json().catch(() => ({}))) as { text?: string }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) throw badRequest('请输入要测试的指令')
    const result = await runtime.dispatcher.runAsOwner(row, text)
    return c.json({ result: result.result, lines: result.lines })
  })

  return router
}
