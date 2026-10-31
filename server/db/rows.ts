import type {
  Availability,
  BotAccessRole,
  BotAllowlistEntry,
  BotApp,
  BotPlatform,
  ChannelType,
  Delivery,
  DeliveryKind,
  DeliveryStatus,
  EventListItem,
  EventPayload,
  EventSeverity,
  EventType,
  Monitor,
  MonitorEvent,
  MonitorKind,
  NewsMatchMode,
  NotificationChannel,
  PublicUser,
  ReleaseStatus,
  Role,
  Snapshot,
  UserStatus,
} from '../../shared/types'
import { safeJsonParse } from '../../shared/utils'

export interface UserRow {
  id: number
  username: string
  display_name: string
  password_hash: string
  role: string
  status: string
  region: string | null
  language: string | null
  timezone: string | null
  ui_locale: string
  poll_interval_seconds: number
  min_discount_percent: number
  news_enabled: number
  news_keywords_json: string
  news_match_mode: string
  must_change_password: number
  max_monitors: number
  onboarded_at: number | null
  last_login_at: number | null
  created_at: number
  updated_at: number
}

export interface SessionRow {
  token_hash: string
  user_id: number
  created_at: number
  expires_at: number
  last_seen_at: number
  ip: string | null
  user_agent: string | null
}

export interface MonitorRow {
  id: number
  user_id: number
  appid: number
  kind: string
  parent_appid: number | null
  name: string
  store_url: string
  header_image: string | null
  region: string
  language: string
  enabled: number
  deleted_at: number | null
  notes: string | null
  min_discount_percent: number | null
  news_watch: number
  baseline_pending: number
  availability: string
  ever_available: number
  release_status: string
  release_date_text: string | null
  currency: string | null
  price_initial_raw: number | null
  price_final_raw: number | null
  price_initial_formatted: string | null
  price_final_formatted: string | null
  discount_percent: number
  is_free: number
  sale_started_at: number | null
  unavailable_since: number | null
  delisted_notified_at: number | null
  delisting_warning_at: number | null
  next_check_at: number
  next_news_check_at: number | null
  last_check_at: number | null
  last_success_at: number | null
  consecutive_failures: number
  consecutive_unavailable: number
  created_at: number
  updated_at: number
}

export interface SnapshotRow {
  id: number
  monitor_id: number
  user_id: number
  checked_at: number
  region: string
  availability: string
  currency: string | null
  price_initial_raw: number | null
  price_final_raw: number | null
  price_initial_formatted: string | null
  price_final_formatted: string | null
  discount_percent: number
  is_free: number
  release_status: string
  suppressed: number
  error_code: string | null
  http_status: number | null
  duration_ms: number | null
}

export interface EventRow {
  id: number
  monitor_id: number
  user_id: number
  type: string
  severity: string
  payload_json: string
  dedupe_key: string
  source: string
  created_at: number
}

export interface EventJoinRow extends EventRow {
  monitor_name: string
  appid: number
  monitor_kind: string
}

export interface DeliveryRow {
  id: number
  user_id: number
  kind: string
  event_id: number | null
  channel_id: number | null
  bot_app_id: number | null
  target_json: string
  payload_json: string
  status: string
  attempts: number
  max_attempts: number
  next_attempt_at: number | null
  locked_until: number | null
  last_error: string | null
  last_http_status: number | null
  created_at: number
  sent_at: number | null
}

export interface ChannelRow {
  id: number
  user_id: number
  name: string
  type: string
  enabled: number
  event_types_json: string
  config_enc: string
  key_version: number
  last_test_at: number | null
  last_test_ok: number | null
  last_test_error: string | null
  created_at: number
  updated_at: number
}

export interface BotAppRow {
  id: number
  user_id: number
  platform: string
  name: string
  webhook_slug: string
  enabled: number
  notify_enabled: number
  last_channel: string | null
  last_chat_id: string | null
  last_chat_at: number | null
  config_enc: string
  key_version: number
  api_base_url: string | null
  created_at: number
  updated_at: number
}

export interface AllowlistRow {
  id: number
  bot_app_id: number
  platform_user_id: string
  display_name: string | null
  role: string
  created_at: number
}

export interface NewsSeenRow {
  id: number
  monitor_id: number
  gid: string
  title: string
  url: string
  published_at: number | null
  matched_keyword: string | null
  event_id: number | null
  seen_at: number
}

export interface InboundMessageRow {
  id: number
  platform: string
  platform_message_id: string
  bot_app_id: number | null
  owner_user_id: number | null
  chat_id: string | null
  user_id: string | null
  text: string | null
  status: string
  error: string | null
  received_at: number
  processed_at: number | null
  reply_delivery_id: number | null
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    role: row.role as Role,
    status: row.status as UserStatus,
    region: row.region,
    language: row.language,
    timezone: row.timezone,
    uiLocale: row.ui_locale as PublicUser['uiLocale'],
    pollIntervalSeconds: Number(row.poll_interval_seconds),
    minDiscountPercent: Number(row.min_discount_percent),
    newsEnabled: row.news_enabled === 1,
    newsKeywords: safeJsonParse<string[]>(row.news_keywords_json, []),
    newsMatchMode: row.news_match_mode as NewsMatchMode,
    mustChangePassword: row.must_change_password === 1,
    maxMonitors: Number(row.max_monitors),
    onboardedAt: row.onboarded_at,
    lastLoginAt: row.last_login_at,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function toMonitor(row: MonitorRow): Monitor {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    appid: Number(row.appid),
    kind: row.kind as MonitorKind,
    parentAppid: row.parent_appid,
    name: row.name,
    storeUrl: row.store_url,
    headerImage: row.header_image,
    region: row.region,
    language: row.language,
    enabled: row.enabled === 1,
    notes: row.notes,
    minDiscountPercent: row.min_discount_percent,
    newsWatch: row.news_watch === 1,
    baselinePending: row.baseline_pending === 1,
    availability: row.availability as Availability,
    everAvailable: row.ever_available === 1,
    releaseStatus: row.release_status as ReleaseStatus,
    releaseDateText: row.release_date_text,
    currency: row.currency,
    priceInitialRaw: row.price_initial_raw,
    priceFinalRaw: row.price_final_raw,
    priceInitialFormatted: row.price_initial_formatted,
    priceFinalFormatted: row.price_final_formatted,
    discountPercent: Number(row.discount_percent),
    isFree: row.is_free === 1,
    saleStartedAt: row.sale_started_at,
    unavailableSince: row.unavailable_since,
    delistedNotifiedAt: row.delisted_notified_at,
    delistingWarningAt: row.delisting_warning_at,
    nextCheckAt: Number(row.next_check_at),
    nextNewsCheckAt: row.next_news_check_at,
    lastCheckAt: row.last_check_at,
    lastSuccessAt: row.last_success_at,
    consecutiveFailures: Number(row.consecutive_failures),
    consecutiveUnavailable: Number(row.consecutive_unavailable),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function toSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: Number(row.id),
    monitorId: Number(row.monitor_id),
    userId: Number(row.user_id),
    checkedAt: Number(row.checked_at),
    region: row.region,
    availability: row.availability as Availability,
    currency: row.currency,
    priceInitialRaw: row.price_initial_raw,
    priceFinalRaw: row.price_final_raw,
    priceInitialFormatted: row.price_initial_formatted,
    priceFinalFormatted: row.price_final_formatted,
    discountPercent: Number(row.discount_percent),
    isFree: row.is_free === 1,
    releaseStatus: row.release_status as ReleaseStatus,
    suppressed: row.suppressed === 1,
    errorCode: row.error_code,
    httpStatus: row.http_status,
    durationMs: row.duration_ms,
  }
}

export function toEvent(row: EventRow): MonitorEvent {
  return {
    id: Number(row.id),
    monitorId: Number(row.monitor_id),
    userId: Number(row.user_id),
    type: row.type as EventType,
    severity: row.severity as EventSeverity,
    payload: safeJsonParse<EventPayload>(row.payload_json, {}),
    source: row.source,
    createdAt: Number(row.created_at),
  }
}

export function toEventListItem(row: EventJoinRow): EventListItem {
  return {
    ...toEvent(row),
    monitorName: row.monitor_name,
    appid: Number(row.appid),
    monitorKind: row.monitor_kind as MonitorKind,
  }
}

export function toDelivery(row: DeliveryRow): Delivery {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    kind: row.kind as DeliveryKind,
    eventId: row.event_id,
    channelId: row.channel_id,
    botAppId: row.bot_app_id,
    status: row.status as DeliveryStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    lastHttpStatus: row.last_http_status,
    createdAt: Number(row.created_at),
    sentAt: row.sent_at,
  }
}

export function toChannel(row: ChannelRow): NotificationChannel {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: row.name,
    type: row.type as ChannelType,
    enabled: row.enabled === 1,
    eventTypes: safeJsonParse<EventType[]>(row.event_types_json, []),
    lastTestAt: row.last_test_at,
    lastTestOk: row.last_test_ok === null ? null : row.last_test_ok === 1,
    lastTestError: row.last_test_error,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function toAllowlistEntry(row: AllowlistRow): BotAllowlistEntry {
  return {
    id: Number(row.id),
    botAppId: Number(row.bot_app_id),
    platformUserId: row.platform_user_id,
    displayName: row.display_name,
    role: row.role as BotAccessRole,
    createdAt: Number(row.created_at),
  }
}

export function toBotApp(row: BotAppRow, allowlist: BotAllowlistEntry[] = []): BotApp {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    platform: row.platform as BotPlatform,
    name: row.name,
    webhookSlug: row.webhook_slug,
    enabled: row.enabled === 1,
    notifyEnabled: row.notify_enabled === 1,
    lastChatAt: row.last_chat_at,
    apiBaseUrl: row.api_base_url,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    allowlist,
  }
}
