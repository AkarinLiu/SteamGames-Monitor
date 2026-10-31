import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const API_PORT = 4180
const WEB_PORT = 4181
const MOCK_PORT = 9998
const SMTP_PORT = 1098

const apiUrl = `http://127.0.0.1:${API_PORT}`
const webUrl = `http://127.0.0.1:${WEB_PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 90 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webUrl,
    actionTimeout: 15 * 1000,
    trace: 'on-first-retry',
    headless: true,
    locale: 'zh-CN',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'tsx scripts/mock-receiver.ts',
      url: `http://127.0.0.1:${MOCK_PORT}/_health`,
      env: {
        MOCK_HOST: '127.0.0.1',
        MOCK_PORT: String(MOCK_PORT),
        MOCK_SMTP_PORT: String(SMTP_PORT),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
    {
      command: 'tsx scripts/e2e-server.ts',
      url: `${apiUrl}/api/health`,
      env: {
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATA_DIR: './data/e2e',
        APP_SECRET: 'e2e-only-secret-0123456789abcdef0123456789abcdef',
        PUBLIC_BASE_URL: apiUrl,
        TRUSTED_ORIGINS: `${webUrl},http://localhost:${WEB_PORT}`,
        COOKIE_SECURE: 'false',
        LOG_LEVEL: 'warn',
        ALLOW_INSECURE_WEBHOOKS: '1',
        ENABLE_DEV_COMMANDS: '1',
        DEV_COMMAND_TOKEN: 'e2e-dev-token',
        STEAM_STORE_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/steam-store`,
        STEAM_API_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/steam-api`,
      },
      reuseExistingServer: false,
      timeout: 60 * 1000,
    },
    {
      command: `vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: webUrl,
      env: {
        VITE_API_PROXY_TARGET: apiUrl,
      },
      reuseExistingServer: false,
      timeout: 60 * 1000,
    },
  ],
})
