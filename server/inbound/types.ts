import type { BotPlatform } from '../../shared/types'
import type { BotAppRow } from '../db/rows'

export interface FeishuBotConfig {
  appId?: string
  appSecret?: string
  encryptKey?: string
  verificationToken?: string
  webhookUrl?: string
  secret?: string
  ownerPlatformUserId?: string
}

export interface DingtalkBotConfig {
  appSecret?: string
  robotCode?: string
  webhookUrl?: string
  secret?: string
  ownerPlatformUserId?: string
}

export interface WecomBotConfig {
  botId: string
  secret: string
  ownerPlatformUserId?: string
}

export type BotConfig = FeishuBotConfig | DingtalkBotConfig | WecomBotConfig

export interface FeishuReplyTarget {
  type: 'feishu'
  messageId: string
  chatId: string
}

export interface DingtalkReplyTarget {
  type: 'dingtalk'
  sessionWebhook: string
  expiresAt: number
  userId: string | null
  robotCode: string | null
}

export interface WecomReplyTarget {
  type: 'wecom'
  reqId: string
  chatId: string
  chatType: 'single' | 'group'
}

export type ReplyTarget = FeishuReplyTarget | DingtalkReplyTarget | WecomReplyTarget

export interface InboundEvent {
  platform: BotPlatform
  botApp: BotAppRow
  ownerUserId: number
  platformMessageId: string
  chatId: string
  platformUserId: string
  userName: string | null
  text: string
  reply: ReplyTarget
  receivedAt: number
}

export type PlatformHandleResult =
  | { kind: 'challenge'; body: unknown }
  | { kind: 'text'; body: string }
  | { kind: 'ignored'; body: unknown }
  | { kind: 'event'; event: InboundEvent }
  | { kind: 'error'; status: number; message: string }
