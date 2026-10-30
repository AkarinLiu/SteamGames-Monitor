export type Role = 'admin' | 'member'
export type UserStatus = 'active' | 'disabled'

export type MonitorKind = 'game' | 'dlc'
export type Availability = 'available' | 'unavailable' | 'unknown'
export type ReleaseStatus = 'coming_soon' | 'released' | 'unknown'

export type EventType =
  | 'release'
  | 'sale_start'
  | 'sale_change'
  | 'sale_end'
  | 'price_change'
  | 'delisting_warning'
  | 'delisted'
  | 'restored'
  | 'check_error'

export type EventSeverity = 'info' | 'warning' | 'critical'

export type ChannelType = 'wecom_bot' | 'feishu_bot' | 'dingtalk_bot' | 'webhook' | 'smtp'
export type BotPlatform = 'feishu' | 'dingtalk' | 'wecom'
export type BotAccessRole = 'admin' | 'viewer'

export type DeliveryKind = 'event' | 'command' | 'test'
export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'canceled'

export type NewsMatchMode = 'title' | 'any'

export interface PublicUser {
  id: number
  username: string
  displayName: string
  role: Role
  status: UserStatus
  region: string | null
  language: string | null
  timezone: string | null
  pollIntervalSeconds: number
  minDiscountPercent: number
  newsEnabled: boolean
  newsKeywords: string[]
  newsMatchMode: NewsMatchMode
  mustChangePassword: boolean
  maxMonitors: number
  onboardedAt: number | null
  lastLoginAt: number | null
  createdAt: number
  updatedAt: number
}

export interface SessionUser {
  id: number
  username: string
  displayName: string
  role: Role
  status: UserStatus
}

export interface Monitor {
  id: number
  userId: number
  appid: number
  kind: MonitorKind
  parentAppid: number | null
  name: string
  storeUrl: string
  headerImage: string | null
  region: string
  language: string
  enabled: boolean
  notes: string | null
  minDiscountPercent: number | null
  newsWatch: boolean
  baselinePending: boolean
  availability: Availability
  everAvailable: boolean
  releaseStatus: ReleaseStatus
  releaseDateText: string | null
  currency: string | null
  priceInitialRaw: number | null
  priceFinalRaw: number | null
  priceInitialFormatted: string | null
  priceFinalFormatted: string | null
  discountPercent: number
  isFree: boolean
  saleStartedAt: number | null
  unavailableSince: number | null
  delistedNotifiedAt: number | null
  nextCheckAt: number
  nextNewsCheckAt: number | null
  lastCheckAt: number | null
  lastSuccessAt: number | null
  consecutiveFailures: number
  consecutiveUnavailable: number
  createdAt: number
  updatedAt: number
}

export interface MonitorDetail extends Monitor {
  snapshotCount: number
  eventCount: number
}

export interface Snapshot {
  id: number
  monitorId: number
  userId: number
  checkedAt: number
  region: string
  availability: Availability
  currency: string | null
  priceInitialRaw: number | null
  priceFinalRaw: number | null
  priceInitialFormatted: string | null
  priceFinalFormatted: string | null
  discountPercent: number
  isFree: boolean
  releaseStatus: ReleaseStatus
  suppressed: boolean
  errorCode: string | null
  httpStatus: number | null
  durationMs: number | null
}

export type EventPayload = Record<string, unknown>

export interface MonitorEvent {
  id: number
  monitorId: number
  userId: number
  type: EventType
  severity: EventSeverity
  payload: EventPayload
  source: string
  createdAt: number
}

export interface EventListItem extends MonitorEvent {
  monitorName: string
  appid: number
  monitorKind: MonitorKind
}

export interface EventDeliverySummary {
  total: number
  sent: number
  failed: number
  pending: number
}

export interface Delivery {
  id: number
  userId: number
  kind: DeliveryKind
  eventId: number | null
  channelId: number | null
  botAppId: number | null
  status: DeliveryStatus
  attempts: number
  maxAttempts: number
  nextAttemptAt: number | null
  lastError: string | null
  lastHttpStatus: number | null
  createdAt: number
  sentAt: number | null
}

export interface NotificationChannel {
  id: number
  userId: number
  name: string
  type: ChannelType
  enabled: boolean
  eventTypes: EventType[]
  lastTestAt: number | null
  lastTestOk: boolean | null
  lastTestError: string | null
  createdAt: number
  updatedAt: number
}

export interface BotAllowlistEntry {
  id: number
  botAppId: number
  platformUserId: string
  displayName: string | null
  role: BotAccessRole
  createdAt: number
}

export type BotConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'disabled'

export interface BotConnectionStatus {
  state: BotConnectionState
  message?: string
  since: number
}

export type WecomQrStatus = 'pending' | 'success' | 'expired' | 'failed'

export interface WecomQrSession {
  sessionId: string
  qrDataUrl: string
  expiresAt: number
}

export interface WecomQrPollResult {
  status: WecomQrStatus
  botId?: number
  enabled?: boolean
  message?: string
}

export type BotAuthRequestStatus = 'pending' | 'approved' | 'denied' | 'expired'

export interface BotAuthRequestInfo {
  status: BotAuthRequestStatus
  canApprove: boolean
  botId: number
  botName: string
  platform: BotPlatform
  platformUserId: string
  platformUserName: string | null
  chatId: string | null
  role: BotAccessRole | null
  createdAt: number
  expiresAt: number
}

export interface BotApp {
  id: number
  userId: number
  platform: BotPlatform
  name: string
  webhookSlug: string
  enabled: boolean
  apiBaseUrl: string | null
  createdAt: number
  updatedAt: number
  allowlist: BotAllowlistEntry[]
  connection?: BotConnectionStatus | null
}

export interface SteamSearchResult {
  appid: number
  name: string
  type: string
  tinyImage: string | null
  priceText: string | null
}

export interface DashboardStats {
  monitors: {
    total: number
    available: number
    onSale: number
    unavailable: number
    comingSoon: number
    paused: number
  }
  events24h: number
  failedDeliveries: number
  pendingDeliveries: number
  lastCheckAt: number | null
  recentEvents: EventListItem[]
}

export interface AdminUserSummary extends PublicUser {
  monitorCount: number
  channelCount: number
  botCount: number
  activeSessions: number
}

export interface RetentionSettings {
  snapshotsDays: number
  eventsDays: number
  deliveriesDays: number
  inboundDays: number
  logsDays: number
  newsSeenDays: number
}

export interface SystemSettings {
  maxTotalMonitors: number
  defaultPollIntervalSeconds: number
  defaultMinDiscountPercent: number
  cacheTtlSeconds: number
  newsCacheTtlSeconds: number
  retention: RetentionSettings
}

export interface SystemHealth {
  uptimeSeconds: number
  database: {
    ok: boolean
    sizeBytes: number
    walSizeBytes: number
  }
  scheduler: {
    running: boolean
    dueMonitors: number
    inflightKeys: number
  }
  rateLimiter: {
    capacity: number
    tokens: number
    cooldownUntil: number | null
  }
  queue: {
    pending: number
    sending: number
    failed24h: number
    oldestPendingAt: number | null
  }
  cache: {
    steamEntries: number
    newsEntries: number
  }
  monitors: {
    total: number
    enabled: number
  }
  lastCheckAt: number | null
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface SetupStatus {
  setupRequired: boolean
  version: string
}

export interface CommandExecutionResult {
  ok: boolean
  result: 'ok' | 'error' | 'denied' | 'throttled' | 'parse_error'
  lines: string[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId: string
}
