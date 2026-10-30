import type { EventPayload, EventSeverity, EventType } from '../../shared/types'

export interface WecomChannelConfig {
  webhookUrl: string
}

export interface FeishuChannelConfig {
  webhookUrl: string
  secret?: string
}

export interface DingtalkChannelConfig {
  webhookUrl: string
  secret?: string
}

export interface WebhookChannelConfig {
  webhookUrl: string
  secret?: string
  authorization?: string
}

export interface SmtpChannelConfig {
  host: string
  port: number
  secure: boolean
  requireTls?: boolean
  username?: string
  password?: string
  from: string
  to: string[]
}

export type ChannelConfig =
  | WecomChannelConfig
  | FeishuChannelConfig
  | DingtalkChannelConfig
  | WebhookChannelConfig
  | SmtpChannelConfig

export interface SendResult {
  ok: boolean
  httpStatus: number | null
  error?: string
  retryAfterMs?: number
  permanent?: boolean
  canceled?: boolean
}

export interface FeishuCard {
  config: { wide_screen_mode: boolean }
  header: {
    template: string
    title: { tag: 'plain_text'; content: string }
  }
  elements: Array<Record<string, unknown>>
}

export interface WebhookMonitorInfo {
  id: number
  appid: number
  name: string
  storeUrl: string
  region: string
  language: string
}

export interface WebhookPayload {
  source: 'steamgames-monitor'
  version: 1
  kind: 'event' | 'test'
  eventId: number | null
  eventType: EventType | null
  severity: EventSeverity | null
  title: string
  text: string
  markdown: string
  html: string
  monitor: WebhookMonitorInfo | null
  data: EventPayload
  createdAt: number
  timestamp: string
}

export interface RenderedMessage {
  title: string
  markdown: string
  card: FeishuCard
  subject: string
  text: string
  html: string
  webhook: WebhookPayload
}
