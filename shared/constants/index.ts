import type {
  BotPlatform,
  ChannelType,
  EventSeverity,
  EventType,
  NewsMatchMode,
  Role,
} from '../types'

export const APP_NAME = 'Steam 销售监控'
export const API_VERSION = '1.1.6'

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
  'release_date',
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
  release_date: {
    label: '发售日期确定',
    short: '发售日期',
    severity: 'info',
    description: '获取到确切的游戏或 DLC 发售日期，或发售日期发生变化',
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

/**
 * Heuristic delisting keywords scanned in Steam news.
 *
 * The list intentionally covers explicit removal-from-sale wording as well as
 * the service and licence events that usually precede it. The matcher
 * (server/monitor/newsKeywords.ts) handles case, full-width text, word
 * boundaries and negations such as "will not be delisted" / "不会下架", so
 * entries can stay focused on phrases that really imply a removal.
 */
export const DEFAULT_NEWS_KEYWORDS = [
  // 简体中文
  '下架',
  '即将下架',
  '暂时下架',
  '暂停销售',
  '停售',
  '停止销售',
  '终止销售',
  '停止售卖',
  '停止发售',
  '终止发售',
  '结束销售',
  '不再销售',
  '不再发售',
  '无法购买',
  '停运',
  '停服',
  '关服',
  '停止运营',
  '暂停运营',
  '终止运营',
  '结束运营',
  '服务终止',
  '停止服务',
  '终止服务',
  '关闭服务器',
  '服务器关闭',
  '授权到期',
  '版权到期',
  // 繁體中文
  '停止販售',
  '終止販售',
  '停止營運',
  '結束營運',
  '停止服務',
  '終止服務',
  '關閉伺服器',
  // English
  'delist',
  'delisted',
  'delisting',
  'de-listed',
  'removed from sale',
  'removed from the store',
  'removed from the steam store',
  'removed from the marketplace',
  'removed from steam',
  'removal from the store',
  'no longer available',
  'no longer be available',
  'no longer available for purchase',
  'no longer purchasable',
  'unavailable for purchase',
  'cannot be purchased',
  'taken down',
  'taken off the store',
  'withdrawn from sale',
  'withdrawn from the store',
  'pulled from the store',
  'discontinued',
  'ceased sales',
  'cease sales',
  'end of sales',
  'end of service',
  'server shutdown',
  'servers shutting down',
  'shutting down servers',
  'license expired',
  'license expiring',
  'rights expired',
  'will not be available',
  "won't be available",
  'will no longer be available',
  'no longer sold',
  'no longer be sold',
  // 日本語
  '販売終了',
  '販売を終了',
  '配信終了',
  '配信を終了',
  '販売停止',
  'サービス終了',
  // 한국어
  '판매 종료',
  '판매 중단',
  '판매가 중단',
  '서비스 종료',
  // Русский
  'снят с продажи',
  'снята с продажи',
  'снятие с продажи',
  'сняли с продажи',
  'продажа прекращена',
  // Español
  'retirado de la venta',
  'retirada de la venta',
  'ya no estará disponible',
  'dejará de estar disponible',
  // Português
  'removido da venda',
  'removida da venda',
  'não estará mais disponível',
  'não será mais vendido',
  // Deutsch
  'aus dem verkauf genommen',
  'nicht mehr erhältlich',
  'nicht mehr verfügbar',
  // Français
  'retiré de la vente',
  'retirée de la vente',
  'ne sera plus disponible',
  "n'est plus disponible",
  // Italiano
  'rimosso dalla vendita',
  'non sarà più disponibile',
  // Nederlands
  'niet meer beschikbaar',
  'niet meer verkrijgbaar',
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
  { value: 'gotify', label: 'Gotify 推送' },
  { value: 'bark', label: 'Bark 推送' },
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
  maxNewsKeywords: 130,
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
