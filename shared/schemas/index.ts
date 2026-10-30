import { z } from 'zod'
import { EVENT_TYPES, LIMITS, NEWS_MATCH_MODE_OPTIONS } from '../constants'

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)

export const UsernameSchema = z
  .string()
  .trim()
  .min(LIMITS.usernameMinLength, `用户名至少 ${LIMITS.usernameMinLength} 个字符`)
  .max(LIMITS.usernameMaxLength)
  .regex(/^[A-Za-z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点或短横线')

export const PasswordSchema = z
  .string()
  .min(LIMITS.passwordMinLength, `密码至少 ${LIMITS.passwordMinLength} 位`)
  .max(LIMITS.passwordMaxLength)

export const DisplayNameSchema = trimmed(1, LIMITS.displayNameMaxLength)
export const RegionSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}$/, '区域必须是两位小写国家代码，例如 cn')
export const LanguageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2,20}$/, '语言代码无效')

export const TimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, '无效的时区')

export const PollIntervalSchema = z
  .number()
  .int()
  .min(LIMITS.minPollIntervalSeconds)
  .max(LIMITS.maxPollIntervalSeconds)

export const NewDiscountSchema = z.number().int().min(1).max(100)

export const NewsMatchModeSchema = z.enum(
  NEWS_MATCH_MODE_OPTIONS.map((o) => o.value) as ['title', 'any'],
)

export const NewsKeywordsSchema = z
  .array(trimmed(1, LIMITS.keywordMaxLength))
  .max(LIMITS.maxNewsKeywords)

export const EventTypeSchema = z.enum(EVENT_TYPES)

// ---------------------------------------------------------------------------
// Auth / setup
// ---------------------------------------------------------------------------

export const SetupSchema = z.object({
  username: UsernameSchema,
  displayName: DisplayNameSchema,
  password: PasswordSchema,
  region: RegionSchema,
  language: LanguageSchema,
  timezone: TimezoneSchema,
  pollIntervalSeconds: PollIntervalSchema.optional(),
  minDiscountPercent: NewDiscountSchema.optional(),
  newsKeywords: NewsKeywordsSchema.optional(),
  newsMatchMode: NewsMatchModeSchema.optional(),
})

export const LoginSchema = z.object({
  username: UsernameSchema,
  password: z.string().min(1).max(LIMITS.passwordMaxLength),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(LIMITS.passwordMaxLength),
  newPassword: PasswordSchema,
})

export const OnboardingSchema = z.object({
  region: RegionSchema,
  language: LanguageSchema,
  timezone: TimezoneSchema,
  pollIntervalSeconds: PollIntervalSchema.optional(),
  minDiscountPercent: NewDiscountSchema.optional(),
  newsEnabled: z.boolean().optional(),
  newsKeywords: NewsKeywordsSchema.optional(),
  newsMatchMode: NewsMatchModeSchema.optional(),
})

// ---------------------------------------------------------------------------
// User settings
// ---------------------------------------------------------------------------

export const UpdateMeSchema = z.object({
  displayName: DisplayNameSchema.optional(),
  region: RegionSchema.optional(),
  language: LanguageSchema.optional(),
  timezone: TimezoneSchema.optional(),
  pollIntervalSeconds: PollIntervalSchema.optional(),
  minDiscountPercent: NewDiscountSchema.optional(),
  newsEnabled: z.boolean().optional(),
  newsKeywords: NewsKeywordsSchema.optional(),
  newsMatchMode: NewsMatchModeSchema.optional(),
})

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const CreateUserSchema = z.object({
  username: UsernameSchema,
  displayName: DisplayNameSchema,
  password: PasswordSchema,
  role: z.enum(['admin', 'member']),
  maxMonitors: z.number().int().min(1).max(2000).optional(),
  region: RegionSchema.optional(),
  language: LanguageSchema.optional(),
  timezone: TimezoneSchema.optional(),
})

export const UpdateUserSchema = z.object({
  displayName: DisplayNameSchema.optional(),
  role: z.enum(['admin', 'member']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  maxMonitors: z.number().int().min(1).max(2000).optional(),
  mustChangePassword: z.boolean().optional(),
})

export const ResetPasswordSchema = z.object({
  password: PasswordSchema.optional(),
})

export const RetentionSchema = z.object({
  snapshotsDays: z.number().int().min(1).max(3650),
  eventsDays: z.number().int().min(1).max(3650),
  deliveriesDays: z.number().int().min(1).max(3650),
  inboundDays: z.number().int().min(1).max(3650),
  logsDays: z.number().int().min(1).max(3650),
  newsSeenDays: z.number().int().min(1).max(3650),
})

export const UpdateAdminSettingsSchema = z.object({
  defaultPollIntervalSeconds: PollIntervalSchema.optional(),
  defaultMinDiscountPercent: NewDiscountSchema.optional(),
  cacheTtlSeconds: z.number().int().min(60).max(24 * 60 * 60).optional(),
  newsCacheTtlSeconds: z.number().int().min(300).max(7 * 24 * 60 * 60).optional(),
  retention: RetentionSchema.partial().optional(),
})

// ---------------------------------------------------------------------------
// Monitors
// ---------------------------------------------------------------------------

export const MonitorQuerySchema = trimmed(1, 200)

export const CreateMonitorSchema = z.object({
  query: MonitorQuerySchema,
  minDiscountPercent: NewDiscountSchema.nullable().optional(),
  notes: z.string().trim().max(LIMITS.notesMaxLength).optional(),
  force: z.boolean().optional(),
  newsWatch: z.boolean().optional(),
})

export const UpdateMonitorSchema = z.object({
  notes: z.string().trim().max(LIMITS.notesMaxLength).nullable().optional(),
  minDiscountPercent: NewDiscountSchema.nullable().optional(),
  newsWatch: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

export const ImportDlcSchema = z.object({
  query: MonitorQuerySchema,
  max: z.number().int().min(1).max(LIMITS.maxDlcImport).optional(),
})

export const MonitorListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z
    .enum(['all', 'on_sale', 'paused', 'unavailable', 'coming_soon', 'available'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).default(20),
  sort: z.enum(['recent', 'name', 'last_check', 'next_check']).optional(),
})

export const EventListQuerySchema = z.object({
  type: EventTypeSchema.optional(),
  monitorId: z.coerce.number().int().positive().optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).default(20),
})

export const SnapshotListQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(2000).default(1000),
})

export const SteamSearchQuerySchema = z.object({
  q: trimmed(1, 100),
  region: RegionSchema.optional(),
  language: LanguageSchema.optional(),
})

// ---------------------------------------------------------------------------
// Notification channels
// ---------------------------------------------------------------------------

export const HttpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  }, '请输入有效的 HTTP(S) URL')

export const WecomChannelConfigSchema = z.object({
  webhookUrl: HttpUrlSchema,
})

export const FeishuChannelConfigSchema = z.object({
  webhookUrl: HttpUrlSchema,
  secret: z.string().trim().max(200).optional().default(''),
})

export const DingtalkChannelConfigSchema = z.object({
  webhookUrl: HttpUrlSchema,
  secret: z.string().trim().max(200).optional().default(''),
})

export const SmtpConfigSchema = z.object({
  host: trimmed(1, 255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  requireTls: z.boolean().optional(),
  username: z.string().trim().max(255).optional().default(''),
  password: z.string().max(255).optional().default(''),
  from: trimmed(1, 320),
  to: z.array(trimmed(3, 320)).min(1).max(20),
})

export const CHANNEL_CONFIG_SCHEMAS = {
  wecom_bot: WecomChannelConfigSchema,
  feishu_bot: FeishuChannelConfigSchema,
  dingtalk_bot: DingtalkChannelConfigSchema,
  smtp: SmtpConfigSchema,
} as const

const channelCommon = {
  name: trimmed(1, LIMITS.channelNameMaxLength),
  enabled: z.boolean().default(true),
  eventTypes: z.array(EventTypeSchema).max(20).default([]),
}

export const CreateChannelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('wecom_bot'),
    ...channelCommon,
    config: WecomChannelConfigSchema,
  }),
  z.object({
    type: z.literal('feishu_bot'),
    ...channelCommon,
    config: FeishuChannelConfigSchema,
  }),
  z.object({
    type: z.literal('dingtalk_bot'),
    ...channelCommon,
    config: DingtalkChannelConfigSchema,
  }),
  z.object({ type: z.literal('smtp'), ...channelCommon, config: SmtpConfigSchema }),
])

export const UpdateChannelSchema = z.object({
  name: trimmed(1, LIMITS.channelNameMaxLength).optional(),
  enabled: z.boolean().optional(),
  eventTypes: z.array(EventTypeSchema).max(20).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  replaceSecret: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

export const FeishuBotConfigSchema = z.object({
  webhookUrl: HttpUrlSchema.optional(),
  secret: z.string().trim().max(200).optional(),
  appId: trimmed(1, 100).optional(),
  appSecret: z.string().trim().max(200).optional(),
  encryptKey: z.string().trim().max(200).optional(),
  verificationToken: z.string().trim().max(200).optional(),
  ownerPlatformUserId: z.string().trim().max(100).optional(),
})

export const DingtalkBotConfigSchema = z.object({
  webhookUrl: HttpUrlSchema.optional(),
  secret: z.string().trim().max(200).optional(),
  appSecret: z.string().trim().max(200).optional(),
  robotCode: trimmed(1, 100).optional(),
  ownerPlatformUserId: z.string().trim().max(100).optional(),
})

export const WecomBotConfigSchema = z.object({
  botId: trimmed(1, 100),
  secret: trimmed(1, 200),
  ownerPlatformUserId: z.string().trim().max(100).optional(),
})

export const BOT_CONFIG_SCHEMAS = {
  feishu: FeishuBotConfigSchema,
  dingtalk: DingtalkBotConfigSchema,
  wecom: WecomBotConfigSchema,
} as const

export const CreateBotSchema = z.object({
  platform: z.enum(['feishu', 'dingtalk', 'wecom']),
  name: trimmed(1, LIMITS.botNameMaxLength),
  enabled: z.boolean().default(true),
  apiBaseUrl: HttpUrlSchema.optional(),
  config: z.record(z.string(), z.unknown()),
})

export const UpdateBotSchema = z.object({
  name: trimmed(1, LIMITS.botNameMaxLength).optional(),
  enabled: z.boolean().optional(),
  apiBaseUrl: HttpUrlSchema.nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  replaceSecret: z.boolean().optional(),
})

export const AllowlistEntrySchema = z.object({
  platformUserId: trimmed(1, 100),
  displayName: z.string().trim().max(100).optional(),
  role: z.enum(['admin', 'viewer']).default('viewer'),
})

// ---------------------------------------------------------------------------
// Dev / mock helpers
// ---------------------------------------------------------------------------

export const DevCommandSchema = z.object({
  platform: z.enum(['feishu', 'dingtalk', 'wecom']),
  botSlug: trimmed(1, 100),
  platformUserId: trimmed(1, 100),
  userName: z.string().trim().max(100).optional(),
  chatId: trimmed(1, 100),
  text: trimmed(1, 4000),
})

export type SetupInput = z.infer<typeof SetupSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type OnboardingInput = z.infer<typeof OnboardingSchema>
export type UpdateMeInput = z.infer<typeof UpdateMeSchema>
export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>
export type CreateMonitorInput = z.infer<typeof CreateMonitorSchema>
export type UpdateMonitorInput = z.infer<typeof UpdateMonitorSchema>
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>
export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>
export type CreateBotInput = z.infer<typeof CreateBotSchema>
export type UpdateBotInput = z.infer<typeof UpdateBotSchema>
export type DevCommandInput = z.infer<typeof DevCommandSchema>
