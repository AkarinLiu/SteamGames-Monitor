import type {
  BotPlatform,
  ChannelType,
  EventSeverity,
  EventType,
  NewsMatchMode,
  Role,
} from '../types'

export const APP_NAME = 'Steam 销售监控'
export const API_VERSION = '1.0.0'

export interface Option<T extends string = string> {
  value: T
  label: string
}

export const REGION_OPTIONS = [
  { value: 'cn', label: '中国 (CNY ¥)' },
  { value: 'hk', label: '中国香港 (HKD)' },
  { value: 'tw', label: '中国台湾 (TWD)' },
  { value: 'us', label: '美国 (USD $)' },
  { value: 'uk', label: '英国 (GBP £)' },
  { value: 'jp', label: '日本 (JPY ¥)' },
  { value: 'kr', label: '韩国 (KRW ₩)' },
  { value: 'sg', label: '新加坡 (SGD)' },
  { value: 'de', label: '德国 (EUR €)' },
  { value: 'fr', label: '法国 (EUR €)' },
  { value: 'ru', label: '俄罗斯 (RUB)' },
  { value: 'br', label: '巴西 (BRL)' },
  { value: 'ca', label: '加拿大 (CAD)' },
  { value: 'au', label: '澳大利亚 (AUD)' },
  { value: 'in', label: '印度 (INR)' },
  { value: 'tr', label: '土耳其 (TRY)' },
  { value: 'ar', label: '阿根廷 (ARS)' },
  { value: 'mx', label: '墨西哥 (MXN)' },
  { value: 'pl', label: '波兰 (PLN)' },
  { value: 'th', label: '泰国 (THB)' },
  { value: 'vn', label: '越南 (VND)' },
  { value: 'id', label: '印度尼西亚 (IDR)' },
  { value: 'my', label: '马来西亚 (MYR)' },
  { value: 'ph', label: '菲律宾 (PHP)' },
  { value: 'ua', label: '乌克兰 (UAH)' },
  { value: 'za', label: '南非 (ZAR)' },
] as const satisfies readonly Option[]

export const LANGUAGE_OPTIONS = [
  { value: 'schinese', label: '简体中文' },
  { value: 'tchinese', label: '繁体中文' },
  { value: 'english', label: 'English' },
  { value: 'japanese', label: '日本語' },
  { value: 'koreana', label: '한국어' },
  { value: 'russian', label: 'Русский' },
  { value: 'french', label: 'Français' },
  { value: 'german', label: 'Deutsch' },
  { value: 'spanish', label: 'Español' },
  { value: 'latam', label: 'Español (Latinoamérica)' },
  { value: 'brazilian', label: 'Português (Brasil)' },
  { value: 'portuguese', label: 'Português' },
  { value: 'italian', label: 'Italiano' },
  { value: 'polish', label: 'Polski' },
  { value: 'turkish', label: 'Türkçe' },
  { value: 'thai', label: 'ไทย' },
  { value: 'vietnamese', label: 'Tiếng Việt' },
  { value: 'ukrainian', label: 'Українська' },
] as const satisfies readonly Option[]

export const REGION_CODES = REGION_OPTIONS.map((o) => o.value)
export const LANGUAGE_CODES = LANGUAGE_OPTIONS.map((o) => o.value)

export const TIMEZONE_OPTIONS = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
] as const

export const EVENT_TYPES = [
  'release',
  'sale_start',
  'sale_change',
  'sale_end',
  'price_change',
  'delisting_warning',
  'delisted',
  'restored',
  'check_error',
] as const satisfies readonly EventType[]

export const EVENT_META: Record<
  EventType,
  { label: string; short: string; severity: EventSeverity; description: string }
> = {
  release: {
    label: '游戏发售',
    short: '发售',
    severity: 'info',
    description: '游戏或 DLC 结束抢先体验 / 预售，正式发售',
  },
  sale_start: {
    label: '促销开始',
    short: '促销',
    severity: 'info',
    description: '折扣达到监控阈值',
  },
  sale_change: {
    label: '促销变化',
    short: '促销变化',
    severity: 'info',
    description: '促销中的折扣或价格发生变化',
  },
  sale_end: {
    label: '促销结束',
    short: '促销结束',
    severity: 'info',
    description: '折扣结束，恢复原价',
  },
  price_change: {
    label: '价格变动',
    short: '价格',
    severity: 'info',
    description: '非促销状态下原价变化或免费状态翻转',
  },
  delisting_warning: {
    label: '下架预警（启发式）',
    short: '下架预警',
    severity: 'warning',
    description: 'Steam 新闻标题命中下架关键词，请人工确认',
  },
  delisted: {
    label: '已下架 / 不可购买',
    short: '下架',
    severity: 'critical',
    description: '连续两次检查确认商店无法购买',
  },
  restored: {
    label: '恢复可售',
    short: '恢复',
    severity: 'info',
    description: '商品从不可购买恢复为可购买，或首次确认可售',
  },
  check_error: {
    label: '检查异常',
    short: '异常',
    severity: 'warning',
    description: '连续多次检查失败',
  },
}

export const EVENT_TYPE_OPTIONS = EVENT_TYPES.map((value) => ({
  value,
  label: EVENT_META[value].label,
}))

export const DEFAULT_NOTIFY_EVENT_TYPES: EventType[] = EVENT_TYPES.filter(
  (t) => t !== 'check_error',
)

export const DEFAULT_NEWS_KEYWORDS = [
  '下架',
  '即将下架',
  '停止销售',
  '终止销售',
  '停售',
  '不再销售',
  'delist',
  'delisted',
  'removed from sale',
  'no longer available',
]

export const NEWS_MATCH_MODE_OPTIONS: Option<NewsMatchMode>[] = [
  { value: 'title', label: '仅标题（推荐）' },
  { value: 'any', label: '标题 + 正文' },
]

export const CHANNEL_TYPE_OPTIONS: Option<ChannelType>[] = [
  { value: 'wecom_bot', label: '企业微信群机器人' },
  { value: 'feishu_bot', label: '飞书机器人' },
  { value: 'dingtalk_bot', label: '钉钉机器人' },
  { value: 'webhook', label: '自定义 WebHook' },
  { value: 'smtp', label: 'SMTP 邮件' },
]

export const BOT_PLATFORM_OPTIONS: Option<BotPlatform>[] = [
  { value: 'feishu', label: '飞书 / Lark 应用机器人' },
  { value: 'dingtalk', label: '钉钉机器人（回调 / Stream）' },
  { value: 'wecom', label: '企业微信智能机器人（长连接）' },
]

export const ROLE_OPTIONS: Option<Role>[] = [
  { value: 'member', label: '普通用户' },
  { value: 'admin', label: '管理员' },
]

export const LIMITS = {
  passwordMinLength: 10,
  passwordMaxLength: 200,
  usernameMinLength: 3,
  usernameMaxLength: 32,
  displayNameMaxLength: 48,
  notesMaxLength: 2000,
  channelNameMaxLength: 64,
  botNameMaxLength: 64,
  minPollIntervalSeconds: 15 * 60,
  maxPollIntervalSeconds: 240 * 60,
  defaultPollIntervalSeconds: 60 * 60,
  defaultMinDiscountPercent: 20,
  maxMonitorsPerUser: 200,
  maxChannelsPerUser: 10,
  maxBotsPerUser: 3,
  maxDlcImport: 50,
  maxNewsKeywords: 30,
  keywordMaxLength: 48,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  loginWindowMs: 15 * 60 * 1000,
  loginMaxAttempts: 5,
  commandRatePerMinute: 10,
  chatRatePerMinute: 30,
  botRatePerMinute: 60,
  maxPageSize: 100,
  defaultPageSize: 20,
  maxRequestBodyBytes: 256 * 1024,
  maxWebhookBodyBytes: 1024 * 1024,
} as const

export const SALES_EVENT_TYPES: EventType[] = [
  'sale_start',
  'sale_change',
  'sale_end',
]
