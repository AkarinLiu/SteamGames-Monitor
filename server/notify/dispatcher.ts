import type { EventType, MonitorEvent } from '../../shared/types'
import { safeJsonParse } from '../../shared/utils'
import type { Db } from '../db/database'
import { listEnabledChannels } from '../db/repo/channels'
import { listNotifyingBots } from '../db/repo/bots'
import { createEventDelivery } from '../db/repo/deliveries'

export function channelAcceptsEvent(channelEventTypes: string[], type: EventType): boolean {
  const configured = channelEventTypes as EventType[]
  if (configured.length === 0) return type !== 'check_error'
  return configured.includes(type)
}

export function enqueueEventDeliveries(db: Db, event: MonitorEvent): number {
  const channels = listEnabledChannels(db, event.userId)
  let created = 0
  for (const channel of channels) {
    const types = safeJsonParse<string[]>(channel.event_types_json, [])
    if (!channelAcceptsEvent(types, event.type)) continue
    const delivery = createEventDelivery(db, {
      userId: event.userId,
      eventId: event.id,
      channelId: channel.id,
      payload: { eventId: event.id },
    })
    if (delivery) created += 1
  }

  for (const bot of listNotifyingBots(db, event.userId)) {
    if (!bot.last_chat_id || !bot.last_channel) continue
    const delivery = createEventDelivery(db, {
      userId: event.userId,
      eventId: event.id,
      botAppId: bot.id,
      target: {
        chatId: bot.last_chat_id,
        chatType: bot.last_channel,
      },
      payload: { eventId: event.id },
    })
    if (delivery) created += 1
  }

  return created
}
