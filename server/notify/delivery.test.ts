import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.ALLOW_INSECURE_WEBHOOKS = '1'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

type Reply = { status: number; body: unknown }

interface Received {
  path: string
  headers: Record<string, string>
  raw: string
  body: Record<string, unknown>
}

describe('notification delivery', () => {
  let server: ReturnType<typeof createServer> | null = null
  let db: import('../db/database').Db | null = null
  let baseUrl = ''
  let received: Received[] = []
  let replies: Reply[] = []

  beforeEach(async () => {
    received = []
    replies = []
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let body: Record<string, unknown> = {}
        try {
          body = JSON.parse(raw) as Record<string, unknown>
        } catch {
          body = { raw }
        }
        const headers: Record<string, string> = {}
        for (const [key, value] of Object.entries(req.headers)) {
          headers[key] = Array.isArray(value) ? value.join(',') : (value ?? '')
        }
        received.push({ path: req.url ?? '', headers, raw, body })
        const reply = replies.shift() ?? { status: 200, body: { errcode: 0 } }
        res.statusCode = reply.status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(reply.body))
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    const { openDatabase } = await import('../db/database')
    db = openDatabase(':memory:')
  })

  afterEach(async () => {
    db?.close()
    db = null
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = null
    }
  })

  async function seed() {
    const { createUser } = await import('../db/repo/users')
    const { createMonitor } = await import('../db/repo/monitors')
    const { createEvent } = await import('../db/repo/events')
    const user = createUser(db!, {
      username: 'alice',
      displayName: 'Alice',
      passwordHash: 'x',
      role: 'member',
      region: 'cn',
      language: 'schinese',
      timezone: 'Asia/Shanghai',
      onboardedAt: Date.now(),
    })
    const monitor = createMonitor(db!, {
      userId: user.id,
      appid: 1091500,
      kind: 'game',
      name: '赛博朋克 2077',
      storeUrl: 'https://store.steampowered.com/app/1091500/',
      region: 'cn',
      language: 'schinese',
      nextCheckAt: Date.now() + 3_600_000,
    })
    const { event } = createEvent(db!, {
      monitorId: monitor.id,
      userId: user.id,
      type: 'sale_start',
      severity: 'info',
      payload: {
        name: '赛博朋克 2077',
        region: 'cn',
        discountPercent: 50,
        priceInitialFormatted: '¥298.00',
        priceFinalFormatted: '¥149.00',
        storeUrl: 'https://store.steampowered.com/app/1091500/',
      },
      dedupeKey: 'test:sale:1',
    })
    return { user, monitor, event }
  }

  async function addChannel(userId: number, open = true) {
    const { createChannel } = await import('../db/repo/channels')
    const { encryptConfig, channelAad, currentKeyVersion } = await import('./secrets')
    return createChannel(db!, {
      userId,
      name: '企微测试',
      type: 'wecom_bot',
      enabled: open,
      eventTypes: [],
      configEnc: encryptConfig({ webhookUrl: `${baseUrl}/hook` }, channelAad(userId, 'wecom_bot')),
      keyVersion: currentKeyVersion(),
    })
  }

  async function addWebhookChannel(userId: number) {
    const { createChannel } = await import('../db/repo/channels')
    const { encryptConfig, channelAad, currentKeyVersion } = await import('./secrets')
    return createChannel(db!, {
      userId,
      name: '自定义 WebHook',
      type: 'webhook',
      enabled: true,
      eventTypes: [],
      configEnc: encryptConfig(
        {
          webhookUrl: `${baseUrl}/custom-hook`,
          secret: 'webhook-secret',
          authorization: 'Bearer delivery-token',
        },
        channelAad(userId, 'webhook'),
      ),
      keyVersion: currentKeyVersion(),
    })
  }

  async function addNotifyingBot(userId: number, notifyEnabled = true) {
    const { createBot, touchBotChat } = await import('../db/repo/bots')
    const { encryptConfig, botAad, currentKeyVersion } = await import('./secrets')
    const bot = createBot(db!, {
      userId,
      platform: 'feishu',
      name: '飞书事件机器人',
      webhookSlug: `bot-notify-${Math.random().toString(36).slice(2, 8)}`,
      enabled: true,
      notifyEnabled,
      configEnc: encryptConfig(
        { appId: 'cli_test', appSecret: 'secret' },
        botAad(userId, 'feishu'),
      ),
      keyVersion: currentKeyVersion(),
    })
    touchBotChat(db!, bot.id, 'chat', 'oc_chat_1', Date.now())
    return bot
  }

  it('sends a queued event and marks it sent', async () => {
    const { user, event } = await seed()
    await addChannel(user.id)
    const { enqueueEventDeliveries } = await import('./dispatcher')
    const { DeliveryWorker } = await import('./deliveryWorker')
    const { findDeliveryRow } = await import('../db/repo/deliveries')

    expect(enqueueEventDeliveries(db!, event)).toBe(1)
    const worker = new DeliveryWorker(db!)
    expect(await worker.tick()).toBe(1)

    expect(received).toHaveLength(1)
    expect(received[0]!.path).toBe('/hook')
    const markdown = (received[0]!.body.markdown as { content: string }).content
    expect(received[0]!.body.msgtype).toBe('markdown')
    expect(markdown).toContain('【促销开始】赛博朋克 2077')
    expect(markdown).toContain('-50%')
    const row = db!.prepare('SELECT status, attempts FROM deliveries').get() as {
      status: string
      attempts: number
    }
    expect(row.status).toBe('sent')
    expect(row.attempts).toBe(1)
    expect(findDeliveryRow(db!, 1)).toBeTruthy()
  })

  it('queues and sends event notifications through an enabled bot', async () => {
    const { user, event } = await seed()
    const bot = await addNotifyingBot(user.id)
    const { enqueueEventDeliveries } = await import('./dispatcher')
    const { DeliveryWorker } = await import('./deliveryWorker')

    expect(enqueueEventDeliveries(db!, event)).toBe(1)
    const row = db!
      .prepare('SELECT target_json, bot_app_id FROM deliveries')
      .get() as { target_json: string; bot_app_id: number }
    expect(JSON.parse(row.target_json)).toEqual({ chatId: 'oc_chat_1', chatType: 'chat' })
    expect(row.bot_app_id).toBe(bot.id)

    const calls: Array<{ botId: number; title: string }> = []
    const worker = new DeliveryWorker(db!)
    worker.setBotEventSender(async (_delivery, deliveredBot, message) => {
      calls.push({ botId: deliveredBot.id, title: message.title })
      return { ok: true, httpStatus: 200 }
    })
    expect(await worker.tick()).toBe(1)
    expect(calls).toEqual([{ botId: bot.id, title: '【促销开始】赛博朋克 2077' }])
    const status = db!.prepare('SELECT status FROM deliveries').get() as { status: string }
    expect(status.status).toBe('sent')
  })

  it('skips bot notifications when the switch is off or no chat is known', async () => {
    const { user, event } = await seed()
    const bot = await addNotifyingBot(user.id, false)
    const { enqueueEventDeliveries } = await import('./dispatcher')
    expect(enqueueEventDeliveries(db!, event)).toBe(0)

    const { updateBot } = await import('../db/repo/bots')
    updateBot(db!, bot.id, { notifyEnabled: true })
    db!
      .prepare('UPDATE bot_apps SET last_chat_id = NULL, last_channel = NULL WHERE id = ?')
      .run(bot.id)
    expect(enqueueEventDeliveries(db!, event)).toBe(0)
  })

  it('sends a structured custom webhook payload with signature and auth header', async () => {
    const { user, event } = await seed()
    await addWebhookChannel(user.id)
    const { enqueueEventDeliveries } = await import('./dispatcher')
    const { DeliveryWorker } = await import('./deliveryWorker')

    expect(enqueueEventDeliveries(db!, event)).toBe(1)
    const worker = new DeliveryWorker(db!)
    expect(await worker.tick()).toBe(1)

    const request = received[0]!
    expect(request.path).toBe('/custom-hook')
    expect(request.headers.authorization).toBe('Bearer delivery-token')
    expect(request.body).toMatchObject({
      source: 'steamgames-monitor',
      version: 1,
      kind: 'event',
      eventType: 'sale_start',
      severity: 'info',
      monitor: { appid: 1091500 },
      data: { discountPercent: 50 },
    })
    const timestamp = request.headers['x-sgm-timestamp']!
    const signature = request.headers['x-sgm-signature']!
    const expected = `sha256=${createHmac('sha256', 'webhook-secret')
      .update(`${timestamp}.${request.raw}`)
      .digest('hex')}`
    expect(signature).toBe(expected)
  })

  it('renders event notifications in the owner UI language', async () => {
    const { user, event } = await seed()
    const { updateUser } = await import('../db/repo/users')
    updateUser(db!, user.id, { uiLocale: 'en' })
    await addWebhookChannel(user.id)
    const { enqueueEventDeliveries } = await import('./dispatcher')
    const { DeliveryWorker } = await import('./deliveryWorker')

    expect(enqueueEventDeliveries(db!, event)).toBe(1)
    const worker = new DeliveryWorker(db!)
    expect(await worker.tick()).toBe(1)

    const request = received[0]!
    expect(request.body).toMatchObject({
      kind: 'event',
      title: '[Sale started] 赛博朋克 2077',
    })
    const text = request.body.text as string
    expect(text).toContain('Current price:')
    expect(text).toContain('Item: 赛博朋克 2077 (appid 1091500)')
  })

  it('retries after a transient failure and succeeds', async () => {
    const { user, event } = await seed()
    await addChannel(user.id)
    replies.push({ status: 500, body: {} }, { status: 200, body: { errcode: 0 } })
    const { enqueueEventDeliveries } = await import('./dispatcher')
    const { DeliveryWorker } = await import('./deliveryWorker')

    enqueueEventDeliveries(db!, event)
    const worker = new DeliveryWorker(db!)
    await worker.tick()
    let row = db!.prepare('SELECT status, attempts, next_attempt_at FROM deliveries').get() as {
      status: string
      attempts: number
      next_attempt_at: number
    }
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.next_attempt_at).toBeGreaterThan(Date.now())

    db!.prepare('UPDATE deliveries SET next_attempt_at = ?').run(Date.now() - 1)
    await worker.tick()
    row = db!.prepare('SELECT status, attempts, next_attempt_at FROM deliveries').get() as {
      status: string
      attempts: number
      next_attempt_at: number
    }
    expect(row.status).toBe('sent')
    expect(row.attempts).toBe(2)
    expect(received).toHaveLength(2)
  })

  it('marks permanent platform errors as failed without retry', async () => {
    const { user, event } = await seed()
    await addChannel(user.id)
    replies.push({ status: 200, body: { errcode: 40001, errmsg: 'invalid webhook' } })
    const { enqueueEventDeliveries } = await import('./dispatcher')
    const { DeliveryWorker } = await import('./deliveryWorker')

    enqueueEventDeliveries(db!, event)
    const worker = new DeliveryWorker(db!)
    await worker.tick()
    const row = db!.prepare('SELECT status, attempts, last_error FROM deliveries').get() as {
      status: string
      attempts: number
      last_error: string
    }
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toContain('40001')
  })

  it('skips events for channels that do not accept the type', async () => {
    const { user, event } = await seed()
    const { createChannel } = await import('../db/repo/channels')
    const { encryptConfig, channelAad, currentKeyVersion } = await import('./secrets')
    createChannel(db!, {
      userId: user.id,
      name: '仅下架',
      type: 'wecom_bot',
      enabled: true,
      eventTypes: ['delisted'],
      configEnc: encryptConfig({ webhookUrl: `${baseUrl}/hook` }, channelAad(user.id, 'wecom_bot')),
      keyVersion: currentKeyVersion(),
    })
    const { enqueueEventDeliveries } = await import('./dispatcher')
    expect(enqueueEventDeliveries(db!, event)).toBe(0)
  })

  it('cancels pending deliveries when the channel is disabled', async () => {
    const { user, event } = await seed()
    const channel = await addChannel(user.id)
    const { enqueueEventDeliveries } = await import('./dispatcher')
    const { DeliveryWorker } = await import('./deliveryWorker')

    enqueueEventDeliveries(db!, event)
    db!.prepare('UPDATE notification_channels SET enabled = 0 WHERE id = ?').run(channel.id)
    const worker = new DeliveryWorker(db!)
    await worker.tick()
    const row = db!.prepare('SELECT status, last_error FROM deliveries').get() as {
      status: string
      last_error: string
    }
    expect(row.status).toBe('canceled')
    expect(received).toHaveLength(0)
  })

  it('never exposes secrets through channel views', async () => {
    const { user } = await seed()
    await addChannel(user.id)
    const { listChannels } = await import('../db/repo/channels')
    const row = listChannels(db!, user.id)[0]!
    expect(row.config_enc.startsWith('v1.')).toBe(true)
    expect(row.config_enc).not.toContain(baseUrl)
    const { decryptConfig, channelAad } = await import('./secrets')
    const config = decryptConfig<{ webhookUrl: string }>(
      row.config_enc,
      channelAad(row.user_id, row.type),
    )
    expect(config.webhookUrl).toBe(`${baseUrl}/hook`)
    expect(() => decryptConfig(row.config_enc, channelAad(999, row.type))).toThrow(
      '无法解密已保存的密钥',
    )
  })
})
