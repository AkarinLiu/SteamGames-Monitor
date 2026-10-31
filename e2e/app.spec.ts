import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

const MOCK = 'http://127.0.0.1:9998'
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'admin-password-123'
const MEMBER_USERNAME = 'member1'
const MEMBER_TEMP_PASSWORD = 'member-temp-pass-1'
const MEMBER_PASSWORD = 'member-new-password-1'
const APP_ID = 990001
const APP_NAME = 'E2E Mock Game'

interface MockRequest {
  id: number
  kind: string
  method: string
  path: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body: unknown
}

interface MockSnapshot {
  requests: MockRequest[]
  smtp: Array<{ subject: string | null; to: string[] }>
}

interface BotListResponse {
  items: Array<{
    id: number
    platform: string
    name: string
    callbackUrl: string | null
    connection?: { state: string } | null
  }>
}

async function mockRequests(request: APIRequestContext): Promise<MockSnapshot> {
  const response = await request.get(`${MOCK}/_requests`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as MockSnapshot
}

async function setMockApp(
  request: APIRequestContext,
  app: Record<string, unknown>,
): Promise<void> {
  const response = await request.post(`${MOCK}/_steam/apps`, { data: { appid: APP_ID, ...app } })
  expect(response.ok()).toBeTruthy()
}

async function apiLogin(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<void> {
  const response = await request.post('/api/auth/login', { data: { username, password } })
  expect(response.status()).toBe(200)
}

async function loginViaForm(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

async function checkNow(request: APIRequestContext, monitorId: number): Promise<void> {
  const response = await request.post(`/api/monitors/${monitorId}/check`, { data: {} })
  const body = await response.text()
  expect(response.status(), body).toBe(200)
}

async function expectOnDashboard(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '概览' })).toBeVisible()
}

test.describe.serial('Steam 销售监控端到端', () => {
  test('初始化管理员并进入概览', async ({ page }) => {
    const status = await page.request.get('/api/setup/status')
    expect(await status.json()).toMatchObject({ setupRequired: true })

    await page.goto('/setup')
    await page.getByLabel('用户名').fill(ADMIN_USERNAME)
    await page.getByLabel('显示名称').fill('管理员')
    await page.getByLabel('密码', { exact: true }).fill(ADMIN_PASSWORD)
    await page.getByLabel('确认密码').fill(ADMIN_PASSWORD)
    await page.getByLabel('区域').selectOption('cn')
    await page.getByLabel('语言').selectOption('schinese')
    await page.getByLabel('时区').selectOption('Asia/Shanghai')
    await page.getByRole('button', { name: '创建管理员并进入系统' }).click()

    await expectOnDashboard(page)
  })

  test('管理员创建成员，成员改密与初始设置', async ({ page }) => {
    await apiLogin(page.request, ADMIN_USERNAME, ADMIN_PASSWORD)
    const created = await page.request.post('/api/admin/users', {
      data: {
        username: MEMBER_USERNAME,
        displayName: '成员一',
        password: MEMBER_TEMP_PASSWORD,
        role: 'member',
      },
    })
    expect(created.status()).toBe(201)
    await page.context().clearCookies()

    await loginViaForm(page, MEMBER_USERNAME, MEMBER_TEMP_PASSWORD)
    await expect(page).toHaveURL(/\/change-password$/)

    await page.getByLabel('当前密码').fill(MEMBER_TEMP_PASSWORD)
    await page.getByLabel('新密码', { exact: true }).fill(MEMBER_PASSWORD)
    await page.getByLabel('确认新密码').fill(MEMBER_PASSWORD)
    await page.getByRole('button', { name: '更新密码' }).click()

    await expect(page).toHaveURL(/\/onboarding$/)
    await page.getByLabel('区域').selectOption('us')
    await page.getByLabel('语言').selectOption('english')
    await page.getByLabel('时区').selectOption('America/New_York')
    await page.getByRole('button', { name: '保存并进入系统' }).click()
    await expectOnDashboard(page)
  })

  test('成员无法读取管理员数据或进入管理页', async ({ page }) => {
    await apiLogin(page.request, MEMBER_USERNAME, MEMBER_PASSWORD)

    const monitors = await page.request.get('/api/monitors')
    expect(((await monitors.json()) as { total: number }).total).toBe(0)

    const adminUsers = await page.request.get('/api/admin/users')
    expect(adminUsers.status()).toBe(403)

    await page.goto('/admin/users')
    await expectOnDashboard(page)
  })

  test('监控、通知与三平台机器人', async ({ page }) => {
    await apiLogin(page.request, ADMIN_USERNAME, ADMIN_PASSWORD)
    const request = page.request

    await request.post(`${MOCK}/_reset`)
    await setMockApp(request, {
      name: APP_NAME,
      available: true,
      comingSoon: true,
      releaseDate: '即将推出',
      isFree: false,
      currency: 'CNY',
      initial: 9900,
      final: 9900,
      discountPercent: 0,
    })

    const channel = await request.post('/api/channels', {
      data: {
        name: '企业微信测试',
        type: 'wecom_bot',
        enabled: true,
        eventTypes: [],
        config: { webhookUrl: `${MOCK}/hooks/wecom` },
      },
    })
    expect(channel.status()).toBe(201)

    const created = await request.post('/api/monitors', { data: { query: String(APP_ID) } })
    expect(created.status()).toBe(201)
    const createdBody = (await created.json()) as { monitor: { id: number; name: string } }
    const monitorId = createdBody.monitor.id
    expect(createdBody.monitor.name).toBe(APP_NAME)

    const noEvents = await request.get('/api/events')
    expect(((await noEvents.json()) as { total: number }).total).toBe(0)

    await setMockApp(request, { releaseDate: '2026 年 10 月 29 日' })
    await checkNow(request, monitorId)
    const releaseDateEvents = await request.get('/api/events?type=release_date')
    expect(((await releaseDateEvents.json()) as { total: number }).total).toBe(1)

    await setMockApp(request, { comingSoon: false, releaseDate: '2026 年 10 月 29 日' })
    await checkNow(request, monitorId)

    await setMockApp(request, { discountPercent: 60, final: 3960 })
    await checkNow(request, monitorId)

    await setMockApp(request, { discountPercent: 0, final: 9900 })
    await checkNow(request, monitorId)

    await setMockApp(request, { available: false })
    await checkNow(request, monitorId)
    const delistedFirst = await request.get(`/api/monitors/${monitorId}/events?limit=50`)
    const delistedFirstTypes = ((await delistedFirst.json()) as { items: Array<{ type: string }> })
      .items.map((item) => item.type)
    expect(delistedFirstTypes).not.toContain('delisted')

    await checkNow(request, monitorId)
    await setMockApp(request, { available: true })
    await checkNow(request, monitorId)

    for (const type of ['release', 'release_date', 'sale_start', 'sale_end', 'delisted', 'restored']) {
      const response = await request.get(`/api/events?type=${type}`)
      const body = (await response.json()) as { total: number }
      expect(body.total, `事件类型 ${type}`).toBe(1)
    }

    await expect
      .poll(
        async () => {
          const { requests } = await mockRequests(request)
          return requests.filter((item) => item.kind === 'webhook' && item.path === '/hooks/wecom')
            .length
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(5)

    await page.goto(`/monitors/${monitorId}`)
    await expect(page.getByRole('heading', { name: APP_NAME })).toBeVisible()

    await test.step('即将停售状态', async () => {
      const dbPath = path.resolve('data/e2e/steam-monitor.db')
      const sqlite = new DatabaseSync(dbPath)
      sqlite.exec('PRAGMA busy_timeout = 5000')
      try {
        sqlite
          .prepare('UPDATE monitors SET delisting_warning_at = ? WHERE id = ?')
          .run(Date.now(), monitorId)
      } finally {
        sqlite.close()
      }

      await page.goto('/monitors')
      const row = page.getByRole('row', { name: new RegExp(APP_NAME) })
      await expect(row.getByText('即将停售', { exact: true })).toBeVisible()

      await page.getByLabel('状态筛选').selectOption('delisting_soon')
      await expect(page.getByRole('row', { name: new RegExp(APP_NAME) })).toBeVisible()

      await page.goto('/')
      const card = page.locator('.stat').filter({ hasText: '即将停售' })
      await expect(card).toContainText('1')

      const cleanup = new DatabaseSync(dbPath)
      cleanup.exec('PRAGMA busy_timeout = 5000')
      try {
        cleanup
          .prepare('UPDATE monitors SET delisting_warning_at = NULL WHERE id = ?')
          .run(monitorId)
      } finally {
        cleanup.close()
      }
    })

    await test.step('三平台机器人配置与模拟指令', async () => {
      const bots = [
        {
          platform: 'feishu',
          name: '飞书测试机器人',
          config: {
            appId: 'cli_e2e',
            appSecret: 'feishu-secret',
            encryptKey: 'feishu-key',
            verificationToken: 'feishu-token',
            ownerPlatformUserId: 'ou_owner',
          },
          sender: 'ou_owner',
        },
        {
          platform: 'dingtalk',
          name: '钉钉测试机器人',
          config: {
            appKey: 'ding-app-key',
            appSecret: 'dingtalk-secret',
            robotCode: 'ding-robot',
            ownerPlatformUserId: 'staff_owner',
          },
          sender: 'staff_owner',
        },
        {
          platform: 'wecom',
          name: '企微测试机器人',
          config: {
            botId: 'bot-e2e',
            secret: 'wecom-long-secret',
            ownerPlatformUserId: 'zhangsan',
          },
          sender: 'zhangsan',
        },
      ]

      for (const item of bots) {
        const bot = await request.post('/api/bots', {
          data: {
            platform: item.platform,
            name: item.name,
            // E2E 不连接真实企业微信；长连接逻辑由单元测试覆盖。
            enabled: item.platform !== 'wecom',
            config: item.config,
          },
        })
        expect(bot.status(), item.platform).toBe(201)
        const body = (await bot.json()) as {
          bot: { id: number; callbackUrl: string | null; connection?: { state: string } | null }
        }
        expect(body.bot.callbackUrl).toEqual(
          item.platform === 'wecom'
            ? null
            : expect.stringContaining(`/webhooks/${item.platform}/`),
        )
        expect(body.bot.connection?.state ?? null).toBe(
          item.platform === 'wecom' ? 'disabled' : null,
        )

        const simulated = await request.post(`/api/bots/${body.bot.id}/test-inbound`, {
          data: { text: '/help' },
        })
        expect(simulated.status()).toBe(200)
        const simulatedBody = (await simulated.json()) as { lines: string[] }
        expect(simulatedBody.lines.join(' ')).toContain('Steam 销售监控指令')
      }

      const list = (await (await request.get('/api/bots')).json()) as BotListResponse
      expect(list.items.map((item) => item.platform).sort()).toEqual([
        'dingtalk',
        'feishu',
        'wecom',
      ])
    })

    await test.step('机器人页面', async () => {
      await page.goto('/bots')
      await expect(page.getByRole('heading', { name: '指令机器人' })).toBeVisible()
      await expect(page.getByText('飞书测试机器人')).toBeVisible()
      await expect(page.getByText('钉钉测试机器人')).toBeVisible()
      await expect(page.getByText('企微测试机器人')).toBeVisible()

      const feishuCard = page.locator('section.card').filter({ hasText: '飞书测试机器人' })
      await feishuCard.getByRole('button', { name: '开启通知' }).click()
      await expect(feishuCard.getByText('事件通知', { exact: true })).toBeVisible()
      await expect(feishuCard.getByText(/还没有记录到最近会话/)).toBeVisible()
      await feishuCard.getByRole('button', { name: '关闭通知' }).click()
      await expect(feishuCard.getByText('事件通知', { exact: true })).toBeHidden()

      await page.getByRole('button', { name: '添加机器人' }).click()
      await expect(page.getByRole('link', { name: /官方接入文档/ })).toHaveAttribute(
        'href',
        /open\.feishu\.cn/,
      )
      await page.getByRole('button', { name: '取消' }).click()

      const qrPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7X8AAAAASUVORK5CYII='
      await page.route('**/api/bots/wecom/qr**', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              sessionId: 'qr-e2e',
              qrDataUrl: qrPng,
              expiresAt: Date.now() + 300_000,
            }),
          })
          return
        }
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'pending', message: '等待扫码授权' }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      })
      await page.getByRole('button', { name: '企微扫码添加' }).click()
      await expect(page.getByRole('heading', { name: '扫码添加企业微信机器人' })).toBeVisible()
      await expect(page.getByAltText('企业微信扫码添加机器人二维码')).toBeVisible()
      await page.locator('.modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
      await expect(page.getByRole('heading', { name: '扫码添加企业微信机器人' })).toBeHidden()
      await page.unroute('**/api/bots/wecom/qr**')

      await page.route('**/api/bots/feishu/qr**', async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON() as { brand?: string }
          const brand = body.brand === 'lark' ? 'lark' : 'feishu'
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              sessionId: `feishu-qr-${brand}`,
              qrDataUrl: qrPng,
              expiresAt: Date.now() + 600_000,
              brand,
              intervalMs: 5000,
            }),
          })
          return
        }
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'pending', message: '等待扫码授权' }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      })
      await page.getByRole('button', { name: /飞书 \/ Lark 扫码/ }).click()
      await expect(page.getByRole('heading', { name: '扫码添加飞书机器人' })).toBeVisible()
      await expect(page.getByAltText('飞书扫码添加机器人二维码')).toBeVisible()
      await page.getByRole('button', { name: 'Lark 国际版' }).click()
      await expect(page.getByRole('heading', { name: '扫码添加Lark机器人' })).toBeVisible()
      await expect(page.getByAltText('Lark扫码添加机器人二维码')).toBeVisible()
      await page.locator('.modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
      await expect(page.getByRole('heading', { name: '扫码添加Lark机器人' })).toBeHidden()
      await page.unroute('**/api/bots/feishu/qr**')

      await page.route('**/api/bots/dingtalk/qr**', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              sessionId: 'dingtalk-qr-e2e',
              qrDataUrl: qrPng,
              expiresAt: Date.now() + 600_000,
              intervalMs: 3000,
            }),
          })
          return
        }
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'pending', message: '等待扫码授权' }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      })
      await page.getByRole('button', { name: '钉钉扫码添加' }).click()
      await expect(page.getByRole('heading', { name: '扫码添加钉钉机器人' })).toBeVisible()
      await expect(page.getByAltText('钉钉扫码添加机器人二维码')).toBeVisible()
      await page.locator('.modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
      await expect(page.getByRole('heading', { name: '扫码添加钉钉机器人' })).toBeHidden()
      await page.unroute('**/api/bots/dingtalk/qr**')
    })

    await test.step('网页端授权页面', async () => {
      const pending = {
        status: 'pending',
        canApprove: true,
        botId: 1,
        botName: '企微测试机器人',
        platform: 'wecom',
        platformUserId: 'zhangsan',
        platformUserName: '张三',
        chatId: 'chat-1',
        role: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + 1_800_000,
      }
      await page.route('**/api/bot-auth/**', async (route) => {
        const method = route.request().method()
        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(pending),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...pending,
            status: 'approved',
            canApprove: false,
            role: 'admin',
          }),
        })
      })
      await page.goto('/authorize/test-token')
      await expect(page.getByRole('heading', { name: '机器人授权' })).toBeVisible()
      await expect(page.getByText('zhangsan')).toBeVisible()
      await page.getByLabel('角色').selectOption('admin')
      await page.getByRole('button', { name: '批准授权' }).click()
      await expect(page.getByText('已批准该用户使用机器人（管理员）')).toBeVisible()
      await page.unroute('**/api/bot-auth/**')
    })

    await test.step('通知渠道官方文档链接', async () => {
      await page.goto('/channels')
      await page.getByRole('button', { name: '添加渠道' }).click()
      await expect(page.getByRole('link', { name: /官方接入文档/ })).toHaveAttribute(
        'href',
        /developer\.work\.weixin\.qq\.com/,
      )
      await page.getByRole('button', { name: '取消' }).click()
    })

    await test.step('自定义 WebHook 渠道', async () => {
      await page.goto('/channels')
      await page.getByRole('button', { name: '添加渠道' }).click()
      await page.getByLabel('渠道名称').fill('自定义 WebHook 测试')
      await page.getByLabel('类型').selectOption('webhook')
      await page.getByLabel('WebHook 地址').fill(`${MOCK}/hooks/custom-webhook`)
      await page.getByLabel('HMAC 签名密钥（可选）').fill('e2e-webhook-secret')
      await page.getByLabel('Authorization 头（可选）').fill('Bearer e2e-token')
      await page.getByRole('button', { name: '保存' }).click()

      const row = page.getByRole('row', { name: /自定义 WebHook 测试/ })
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: '测试' }).click()
      await expect(row.getByText('成功', { exact: true })).toBeVisible()

      await expect
        .poll(async () => {
          const { requests } = await mockRequests(request)
          return requests.filter((item) => item.path === '/hooks/custom-webhook').length
        })
        .toBeGreaterThan(0)
      const { requests } = await mockRequests(request)
      const hook = requests.find((item) => item.path === '/hooks/custom-webhook')
      expect(hook?.body).toMatchObject({
        source: 'steamgames-monitor',
        version: 1,
        kind: 'test',
        eventType: null,
      })
      expect(hook?.headers.authorization).toBe('Bearer e2e-token')
      expect(hook?.headers['x-sgm-timestamp']).toMatch(/^\d+$/)
      expect(hook?.headers['x-sgm-signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
    })

    await test.step('侧栏只高亮当前页面', async () => {
      await page.goto('/events')
      await expect(page.getByRole('heading', { name: '事件记录' })).toBeVisible()
      const active = page.locator('.app-sidebar .nav-link.active')
      await expect(active).toHaveCount(1)
      await expect(active).toHaveText('事件记录')
    })

    await test.step('SMTP 渠道发送测试邮件', async () => {
      const smtpChannel = await request.post('/api/channels', {
        data: {
          name: 'SMTP 测试',
          type: 'smtp',
          enabled: true,
          eventTypes: [],
          config: {
            host: '127.0.0.1',
            port: 1098,
            secure: false,
            from: 'monitor@example.com',
            to: ['admin@example.com'],
          },
        },
      })
      expect(smtpChannel.status()).toBe(201)
      const smtpBody = (await smtpChannel.json()) as { channel: { id: number } }
      const tested = await request.post(`/api/channels/${smtpBody.channel.id}/test`, { data: {} })
      const result = (await tested.json()) as { ok: boolean; error?: string | null }
      expect(result.ok, result.error ?? '').toBeTruthy()

      const { smtp } = await mockRequests(request)
      expect(smtp.length).toBeGreaterThanOrEqual(1)
      expect(smtp[0]?.subject ?? '').toContain('测试')
    })
  })

  test('切换界面语言并持久化', async ({ page }) => {
    await apiLogin(page.request, ADMIN_USERNAME, ADMIN_PASSWORD)
    await page.goto('/bots')
    await expect(page.getByRole('heading', { name: '指令机器人' })).toBeVisible()

    await page.getByLabel('UI locale').selectOption('en')
    await expect(page.getByRole('heading', { name: 'Command bots' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Command bots' })).toBeVisible()

    const bots = (await (await page.request.get('/api/bots')).json()) as BotListResponse
    const botId = bots.items[0]?.id ?? 0
    expect(botId).toBeGreaterThan(0)
    const botReply = await page.request.post(`/api/bots/${botId}/test-inbound`, {
      data: { text: '/help' },
    })
    const botReplyBody = (await botReply.json()) as { lines: string[] }
    expect(botReplyBody.lines.join('\n')).toContain('Steam Sales Monitor commands')

    const webhookChannel = await page.request.post('/api/channels', {
      data: {
        name: 'E2E English WebHook',
        type: 'webhook',
        enabled: true,
        eventTypes: [],
        config: { webhookUrl: `${MOCK}/hooks/en-webhook` },
      },
    })
    expect(webhookChannel.status()).toBe(201)
    const webhookChannelId = ((await webhookChannel.json()) as { channel: { id: number } })
      .channel.id
    const webhookTest = await page.request.post(`/api/channels/${webhookChannelId}/test`, {
      data: {},
    })
    expect(webhookTest.ok()).toBeTruthy()
    await expect
      .poll(
        async () => {
          const { requests } = await mockRequests(page.request)
          return requests.filter((item) => item.path === '/hooks/en-webhook').length
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0)
    const { requests: englishHookRequests } = await mockRequests(page.request)
    const englishHook = englishHookRequests.find((item) => item.path === '/hooks/en-webhook')
    expect(englishHook?.body).toMatchObject({
      kind: 'test',
      title: '[Test] Steam Monitor',
    })
    const englishHookBody = englishHook?.body as { text?: string } | undefined
    expect(englishHookBody?.text).toContain(
      'Notification channel "E2E English WebHook" is configured successfully.',
    )

    for (const locale of ['de', 'fr', 'it', 'ja', 'ko', 'ko-KP', 'nl', 'ru', 'zh-TW']) {
      await page.getByLabel('UI locale').selectOption(locale)
      await expect(page.locator('h1')).not.toHaveText('指令机器人')
      await expect(page.locator('h1')).not.toBeEmpty()
    }
  })
})
