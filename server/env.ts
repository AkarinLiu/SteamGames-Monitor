import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'

try {
  process.loadEnvFile()
} catch {
  // No .env file; rely on process environment (Docker env_file, CI, tests).
}

const booleanEnv = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
    }
    return Boolean(value)
  }, z.boolean())

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(8787),
  DATA_DIR: z.string().default('./data'),
  DATABASE_PATH: z.string().optional(),
  APP_SECRET: z.string().optional(),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8787'),
  TRUSTED_ORIGINS: z.string().default(''),
  COOKIE_SECURE: booleanEnv(false),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MAX_TOTAL_MONITORS: z.coerce.number().int().positive().default(2000),
  ALLOW_INSECURE_WEBHOOKS: booleanEnv(false),
  ENABLE_DEV_COMMANDS: booleanEnv(false),
  DEV_COMMAND_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  STEAM_STORE_BASE_URL: z.string().url().default('https://store.steampowered.com'),
  STEAM_API_BASE_URL: z.string().url().default('https://api.steampowered.com'),
})

const parsed = EnvSchema.parse(process.env)

const isProduction = parsed.NODE_ENV === 'production'
const isTest = parsed.NODE_ENV === 'test'

let appSecret = parsed.APP_SECRET ?? ''
if (!appSecret) {
  if (isProduction) {
    throw new Error('APP_SECRET is required in production (at least 32 characters)')
  }
  appSecret = randomBytes(48).toString('base64')
  console.warn(
    '[env] APP_SECRET is not set; using an ephemeral secret. Encrypted channel/bot credentials will be unreadable after restart.',
  )
}
if (appSecret.length < 32) {
  throw new Error('APP_SECRET must be at least 32 characters long')
}

const dataDir = path.resolve(parsed.DATA_DIR)
const databasePath = parsed.DATABASE_PATH
  ? path.resolve(parsed.DATABASE_PATH)
  : path.join(dataDir, 'steam-monitor.db')

const trustedOrigins = parsed.TRUSTED_ORIGINS.split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean)

const publicBaseUrl = parsed.PUBLIC_BASE_URL.replace(/\/+$/, '')

export const env = Object.freeze({
  ...parsed,
  APP_SECRET: appSecret,
  DATA_DIR: dataDir,
  DATABASE_PATH: databasePath,
  PUBLIC_BASE_URL: publicBaseUrl,
  STEAM_STORE_BASE_URL: parsed.STEAM_STORE_BASE_URL.replace(/\/+$/, ''),
  STEAM_API_BASE_URL: parsed.STEAM_API_BASE_URL.replace(/\/+$/, ''),
  TRUSTED_ORIGINS: trustedOrigins,
  isProduction,
  isTest,
  isDevelopment: !isProduction && !isTest,
})

export type AppEnv = typeof env
