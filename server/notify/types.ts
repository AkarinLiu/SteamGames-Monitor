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

export interface RenderedMessage {
  title: string
  markdown: string
  card: FeishuCard
  subject: string
  text: string
  html: string
}
