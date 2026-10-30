import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/database'
import type { BotAppRow, DeliveryRow } from '../db/rows'
import type { BotEventServices } from './botEvents'

process.env.NODE_ENV = 'test'
process.env.ALLOW_INSECURE_WEBHOOKS = '1'
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

interface Received {
  path: string
  query: Record<string, string>
  body: unknown
}

describe('bot event notifications', () => {
  let server: ReturnType<typeof createServer> | null = null
  let db: Db
  let baseUrl = ''
  let received: Received[] = []

  beforeEach(async () => {
    received = []
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let body: unknown = null
        try {
          body = raw ? JSON.parse(raw) : null
        } catch {
          body = raw
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        received.push({
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          body,
        })
        res.setHeader('content-type', 'application/json')
        if (url.pathname === '/open-apis/auth/v3/tenant_access_token/internal') {
          res.end(JSON.stringify({ code: 0, tenant_access_token: 'feishu-token', expire: 7200 }))
          return
        }
        if (url.pathname === '/v1.0/oauth2/accessToken') {
          res.end(JSON.stringify({ accessToken: 'dingtalk-token', expireIn: 7200 }))
          return
        }
        res.end(JSON.stringify({ code: 0 }))
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
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = null
    }
  })

  async function createBot(
    platform: 'feishu' | 'dingtalk' | 'wecom',
    config: Record<string, unknown>,
  ): Promise<BotAppRow> {
    const { createUser } = await import('../db/repo/users')
    const { createBot } = await import('../db/repo/bots')
    const { encryptConfig, botAad, currentKeyVersion } = await import('./secrets')
    const user = createUser(db, {
      username: `${platform}-user`,
      displayName: platform,
      passwordHash: 'x',
      role: 'member',
      region: 'cn',
      language: 'schinese',
      timezone: 'Asia/Shanghai',
      onboardedAt: Date.now(),
    })
    return createBot(db, {
      userId: user.id,
      platform,
      name: `${platform} 机器人`,
      webhookSlug: `${platform}-event-bot`,
      enabled: true,
      notifyEnabled: true,
      configEnc: encryptConfig(config, botAad(user.id, platform)),
      keyVersion: currentKeyVersion(),
      apiBaseUrl: baseUrl,
    })
  }

  function delivery(target: Record<string, unknown>): DeliveryRow {
    return { target_json: JSON.stringify(target) } as unknown as DeliveryRow
  }

  it('sends Feishu event notifications to the last chat', async () => {
    const { sendBotEvent } = await import('./botEvents')
    const { renderTestMessage } = await import('./render')
    const bot = await createBot('feishu', { appId: 'cli_test', appSecret: 'secret' })
    const services: BotEventServices = {
      sendWecom: async () => ({ ok: true, httpStatus: null }),
    }

    const result = await sendBotEvent(
      db,
      bot,
      delivery({ chatId: 'oc_chat_1', chatType: 'chat' }),
      renderTestMessage('飞书机器人', 'Asia/Shanghai'),
      services,
    )
    expect(result.ok).toBe(true)
    const message = received.find((item) => item.path === '/open-apis/im/v1/messages')
    expect(message?.query.receive_id_type).toBe('chat_id')
    expect(message?.body).toMatchObject({
      receive_id: 'oc_chat_1',
      msg_type: 'text',
    })
  })

  it('sends DingTalk group and single event notifications', async () => {
    const { sendBotEvent } = await import('./botEvents')
    const { renderTestMessage } = await import('./render')
    const bot = await createBot('dingtalk', {
      appKey: 'ding-app-key',
      appSecret: 'ding-secret',
      robotCode: 'ding-robot',
    })
    const services: BotEventServices = {
      sendWecom: async () => ({ ok: true, httpStatus: null }),
    }
    const message = renderTestMessage('钉钉机器人', 'Asia/Shanghai')

    const group = await sendBotEvent(
      db,
      bot,
      delivery({ chatId: 'cid_group', chatType: 'group' }),
      message,
      services,
    )
    expect(group.ok).toBe(true)
    const groupRequest = received.find((item) => item.path === '/v1.0/robot/groupMessages/send')
    expect(groupRequest?.body).toMatchObject({
      robotCode: 'ding-robot',
      openConversationId: 'cid_group',
      msgKey: 'sampleMarkdown',
    })

    const single = await sendBotEvent(
      db,
      bot,
      delivery({ chatId: 'staff_1', chatType: 'single' }),
      message,
      services,
    )
    expect(single.ok).toBe(true)
    const singleRequest = received.find((item) => item.path === '/v1.0/robot/oToMessages/batchSend')
    expect(singleRequest?.body).toMatchObject({
      robotCode: 'ding-robot',
      userIds: ['staff_1'],
      msgKey: 'sampleMarkdown',
    })
  })

  it('sends WeCom event notifications through the long connection callback', async () => {
    const { sendBotEvent } = await import('./botEvents')
    const { renderTestMessage } = await import('./render')
    const bot = await createBot('wecom', { botId: 'bot-id', secret: 'bot-secret' })
    const calls: Array<{
      botId: number
      target: { chatId: string; chatType: 'single' | 'group' }
      text: string
    }> = []
    const services: BotEventServices = {
      sendWecom: async (botId, target, text) => {
        calls.push({ botId, target, text })
        return { ok: true, httpStatus: null }
      },
    }

    const result = await sendBotEvent(
      db,
      bot,
      delivery({ chatId: 'chat_1', chatType: 'group' }),
      renderTestMessage('企微机器人', 'Asia/Shanghai'),
      services,
    )
    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      {
        botId: bot.id,
        target: { chatId: 'chat_1', chatType: 'group' },
        text: expect.stringContaining('【测试通知】'),
      },
    ])
  })
})
