import { Hono } from 'hono'
import {
  CHANNEL_CONFIG_SCHEMAS,
  CreateChannelSchema,
  UpdateChannelSchema,
} from '../../../shared/schemas'
import type { ChannelType } from '../../../shared/types'
import { LIMITS } from '../../../shared/constants'
import type { AppBindings } from '../context'
import type { Runtime } from '../../runtime'
import { parseIdParam, parseJson, parseWith } from '../respond'
import { requireAuth, requirePasswordChanged } from '../middleware/guards'
import { conflict, notFound } from '../../lib/errors'
import type { ChannelRow, UserRow } from '../../db/rows'
import { toChannel } from '../../db/rows'
import {
  countChannelsForUser,
  createChannel,
  deleteChannel,
  findChannel,
  listChannels,
  updateChannel,
  updateChannelTestResult,
} from '../../db/repo/channels'
import {
  channelAad,
  decryptConfig,
  encryptConfig,
  SecretDecryptError,
  currentKeyVersion,
} from '../../notify/secrets'
import { renderTestMessage } from '../../notify/render'
import { sendByChannel } from '../../notify/deliveryWorker'
import { assertSafeOutboundUrl } from '../../notify/urlGuard'
import { cancelPendingForChannel } from '../../db/repo/deliveries'
import type { ChannelConfig } from '../../notify/types'

function parseConfig(type: ChannelType, input: unknown): Record<string, unknown> {
  switch (type) {
    case 'wecom_bot':
      return parseWith(CHANNEL_CONFIG_SCHEMAS.wecom_bot, input)
    case 'feishu_bot':
      return parseWith(CHANNEL_CONFIG_SCHEMAS.feishu_bot, input)
    case 'dingtalk_bot':
      return parseWith(CHANNEL_CONFIG_SCHEMAS.dingtalk_bot, input)
    case 'smtp':
      return parseWith(CHANNEL_CONFIG_SCHEMAS.smtp, input)
    default:
      throw conflict(`不支持的通知渠道类型：${String(type)}`)
  }
}

function assertWebhookAllowed(type: ChannelType, config: Record<string, unknown>): void {
  if (type === 'smtp') return
  const webhookUrl = config.webhookUrl
  if (typeof webhookUrl === 'string') assertSafeOutboundUrl(webhookUrl)
}

function decryptChannelConfig(row: ChannelRow): ChannelConfig {
  return decryptConfig<ChannelConfig>(row.config_enc, channelAad(row.user_id, row.type))
}

function configSummary(type: ChannelType, config: ChannelConfig): Record<string, unknown> {
  if (type === 'smtp') {
    const smtp = config as {
      host?: string
      port?: number
      secure?: boolean
      requireTls?: boolean
      username?: string
      password?: string
      from?: string
      to?: string[]
    }
    return {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTls: smtp.requireTls ?? false,
      from: smtp.from,
      to: smtp.to ?? [],
      usernameSet: Boolean(smtp.username),
      passwordSet: Boolean(smtp.password),
    }
  }
  const webhook = (config as { webhookUrl?: string }).webhookUrl ?? ''
  let webhookHost = ''
  try {
    webhookHost = new URL(webhook).host
  } catch {
    webhookHost = ''
  }
  const secretSet = Boolean((config as { secret?: string }).secret)
  return { webhookHost, webhookSet: Boolean(webhook), secretSet }
}

function toChannelView(row: ChannelRow): Record<string, unknown> {
  const channel = toChannel(row)
  try {
    const config = decryptChannelConfig(row)
    return { ...channel, config: configSummary(row.type as ChannelType, config) }
  } catch (error) {
    if (error instanceof SecretDecryptError) {
      return { ...channel, config: {}, configError: error.message }
    }
    throw error
  }
}

function mergeConfig(
  type: ChannelType,
  existing: Record<string, unknown>,
  input: Record<string, unknown>,
  replaceSecret: boolean,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing }

  if (type === 'smtp') {
    for (const key of ['host', 'port', 'secure', 'requireTls', 'from', 'to']) {
      if (input[key] !== undefined) merged[key] = input[key]
    }
    if (typeof input.username === 'string' && (input.username || replaceSecret)) {
      merged.username = input.username
    }
    if (typeof input.password === 'string' && (input.password || replaceSecret)) {
      merged.password = input.password
    }
  } else {
    for (const key of ['webhookUrl', 'secret']) {
      const value = input[key]
      if (typeof value === 'string' && (value || replaceSecret)) {
        merged[key] = value
      }
    }
  }
  return merged
}

export function channelRoutes(runtime: Runtime): Hono<AppBindings> {
  const router = new Hono<AppBindings>()
  const db = runtime.db

  router.use('*', requireAuth(db), requirePasswordChanged())

  router.get('/', (c) => {
    const user = c.get('user') as UserRow
    return c.json({
      items: listChannels(db, user.id).map(toChannelView),
      quota: { used: countChannelsForUser(db, user.id), limit: LIMITS.maxChannelsPerUser },
    })
  })

  router.post('/', async (c) => {
    const user = c.get('user') as UserRow
    const input = await parseJson(c, CreateChannelSchema)
    if (countChannelsForUser(db, user.id) >= LIMITS.maxChannelsPerUser) {
      throw conflict(`每个账号最多创建 ${LIMITS.maxChannelsPerUser} 个通知渠道`)
    }
    const config = parseConfig(input.type, input.config)
    assertWebhookAllowed(input.type, config)
    const encoded = encryptConfig(config, channelAad(user.id, input.type))
    const row = createChannel(db, {
      userId: user.id,
      name: input.name,
      type: input.type,
      enabled: input.enabled,
      eventTypes: input.eventTypes,
      configEnc: encoded,
      keyVersion: currentKeyVersion(),
    })
    return c.json({ channel: toChannelView(row) }, 201)
  })

  router.patch('/:id', async (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findChannel(db, user.id, id)
    if (!row) throw notFound('通知渠道不存在')
    const input = await parseJson(c, UpdateChannelSchema)

    let configEnc: string | undefined
    if (input.config) {
      let existing: Record<string, unknown> = {}
      try {
        existing = decryptChannelConfig(row) as unknown as Record<string, unknown>
      } catch (error) {
        if (!(error instanceof SecretDecryptError)) throw error
      }
      const merged = mergeConfig(
        row.type as ChannelType,
        existing,
        input.config,
        input.replaceSecret === true,
      )
      const validated = parseConfig(row.type as ChannelType, merged)
      assertWebhookAllowed(row.type as ChannelType, validated)
      configEnc = encryptConfig(
        validated,
        channelAad(row.user_id, row.type),
      )
    }

    const updated = updateChannel(db, id, {
      name: input.name,
      enabled: input.enabled,
      eventTypes: input.eventTypes,
      configEnc,
      keyVersion: configEnc ? currentKeyVersion() : undefined,
    })
    if (input.enabled === false) {
      cancelPendingForChannel(db, id)
    }
    return c.json({ channel: toChannelView(updated!) })
  })

  router.delete('/:id', (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    if (!findChannel(db, user.id, id)) throw notFound('通知渠道不存在')
    db.transaction(() => {
      cancelPendingForChannel(db, id)
      deleteChannel(db, user.id, id)
    })
    return c.json({ ok: true })
  })

  router.post('/:id/test', async (c) => {
    const user = c.get('user') as UserRow
    const id = parseIdParam(c)
    const row = findChannel(db, user.id, id)
    if (!row) throw notFound('通知渠道不存在')
    const startedAt = Date.now()
    let result: { ok: boolean; httpStatus: number | null; error?: string }
    try {
      const config = decryptChannelConfig(row)
      const message = renderTestMessage(row.name, user.timezone)
      result = await sendByChannel(row.type as ChannelType, config, message)
    } catch (error) {
      result = {
        ok: false,
        httpStatus: null,
        error: error instanceof SecretDecryptError ? error.message : (error as Error).message,
      }
    }
    updateChannelTestResult(db, id, result.ok, result.ok ? null : (result.error ?? '发送失败'))
    return c.json({
      ok: result.ok,
      httpStatus: result.httpStatus,
      error: result.error ?? null,
      latencyMs: Date.now() - startedAt,
    })
  })

  return router
}
