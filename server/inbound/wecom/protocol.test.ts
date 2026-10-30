import { describe, expect, it } from 'vitest'
import type { BotAppRow } from '../../db/rows'
import {
  parseWecomMessageFrame,
  stripWecomGroupMention,
  type WecomMessageFrame,
} from './protocol'

const bot = {
  id: 1,
  user_id: 7,
  platform: 'wecom',
  name: '企业微信机器人',
  webhook_slug: 'wecom-test',
  enabled: 1,
  notify_enabled: 0,
  last_channel: null,
  last_chat_id: null,
  last_chat_at: null,
  config_enc: 'x',
  key_version: 1,
  api_base_url: null,
  created_at: 1,
  updated_at: 1,
} as BotAppRow

function frame(overrides: Record<string, unknown> = {}): WecomMessageFrame {
  return {
    cmd: 'aibot_msg_callback',
    headers: { req_id: 'req-1' },
    body: {
      msgid: 'msg-1',
      chattype: 'single',
      from: { userid: 'zhangsan' },
      msgtype: 'text',
      text: { content: '/help' },
      ...overrides,
    },
  } as WecomMessageFrame
}

describe('parseWecomMessageFrame', () => {
  it('解析单聊文本并生成长连接回复目标', () => {
    const event = parseWecomMessageFrame(bot, frame(), 100)
    expect(event).toMatchObject({
      platform: 'wecom',
      ownerUserId: 7,
      platformMessageId: 'msg-1',
      chatId: 'zhangsan',
      platformUserId: 'zhangsan',
      text: '/help',
      reply: {
        type: 'wecom',
        reqId: 'req-1',
        chatId: 'zhangsan',
        chatType: 'single',
      },
      receivedAt: 100,
    })
  })

  it('群聊去掉开头的机器人 @ 并保留 chatid', () => {
    const event = parseWecomMessageFrame(
      bot,
      frame({
        chatid: 'chat-1',
        chattype: 'group',
        text: { content: '@Steam监控\u2005/list --all' },
      }),
    )
    expect(event?.text).toBe('/list --all')
    expect(event?.chatId).toBe('chat-1')
    expect(event?.reply).toMatchObject({ type: 'wecom', chatType: 'group' })
  })

  it('忽略非文本、非消息回调和缺少回复标识的帧', () => {
    expect(
      parseWecomMessageFrame(bot, {
        ...frame(),
        cmd: 'aibot_event_callback',
      }),
    ).toBeNull()
    expect(parseWecomMessageFrame(bot, frame({ msgtype: 'image' }))).toBeNull()
    expect(
      parseWecomMessageFrame(bot, {
        ...frame(),
        headers: {},
      }),
    ).toBeNull()
  })

  it('去掉 @ 后为空时不生成事件', () => {
    expect(
      parseWecomMessageFrame(
        bot,
        frame({ chattype: 'group', text: { content: '@Steam监控' } }),
      ),
    ).toBeNull()
  })
})

describe('stripWecomGroupMention', () => {
  it('支持普通空格和全角空格', () => {
    expect(stripWecomGroupMention('@机器人 /help')).toBe('/help')
    expect(stripWecomGroupMention('@机器人\u3000/help')).toBe('/help')
    expect(stripWecomGroupMention('@机器人\u2005/help')).toBe('/help')
  })
})
