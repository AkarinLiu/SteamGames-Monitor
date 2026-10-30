import type { BotAppRow } from '../../db/rows'
import type { InboundEvent } from '../types'

export interface WecomMessageFrame {
  cmd?: string
  headers?: {
    req_id?: string
  }
  body?: {
    msgid?: string
    chatid?: string
    chattype?: 'single' | 'group'
    from?: {
      userid?: string
    }
    msgtype?: string
    text?: {
      content?: string
    }
  }
}

export function stripWecomGroupMention(text: string): string {
  return text.replace(/^(?:@[^\s\u2005]+(?:[\s\u2005]+|$))+/, '').trim()
}

export function parseWecomMessageFrame(
  bot: BotAppRow,
  frame: WecomMessageFrame,
  now = Date.now(),
): InboundEvent | null {
  if (frame.cmd !== 'aibot_msg_callback') return null
  const body = frame.body
  if (!body || body.msgtype !== 'text') return null

  const reqId = frame.headers?.req_id
  const platformUserId = body.from?.userid
  if (!reqId || !body.msgid || !platformUserId) return null

  const chatType = body.chattype === 'group' ? 'group' : 'single'
  const rawText = body.text?.content?.trim() ?? ''
  let text = rawText
  if (chatType === 'group') {
    const mention = `@${bot.name}`
    text = rawText.startsWith(mention)
      ? rawText.slice(mention.length).trim()
      : stripWecomGroupMention(rawText)
  }
  if (!text) return null

  const chatId = body.chatid ?? platformUserId
  return {
    platform: 'wecom',
    botApp: bot,
    ownerUserId: bot.user_id,
    platformMessageId: body.msgid,
    chatId,
    platformUserId,
    userName: null,
    text,
    reply: {
      type: 'wecom',
      reqId,
      chatId,
      chatType,
    },
    receivedAt: now,
  }
}
