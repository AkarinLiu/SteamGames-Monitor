import type { EventSeverity, EventType, MonitorEvent } from '../../shared/types'
import { escapeHtml, formatDateTime, formatPriceLine } from '../../shared/utils'
import type { MonitorRow } from '../db/rows'
import {
  botMessages,
  eventLabel,
  formatBotMessage as fmt,
  type BotMessages,
} from '../i18n'
import type { FeishuCard, RenderedMessage, WebhookPayload } from './types'

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const FEISHU_TEMPLATES: Record<EventSeverity, string> = {
  info: 'turquoise',
  warning: 'orange',
  critical: 'red',
}

function eventTitle(type: EventType, name: string, messages: BotMessages): string {
  return fmt(messages.notificationTitle, {
    label: eventLabel(type, messages),
    name,
  })
}

function buildEventLines(
  event: MonitorEvent,
  monitor: MonitorRow,
  messages: BotMessages,
): string[] {
  const p = event.payload
  const name = asString(p.name) ?? monitor.name
  const region = asString(p.region) ?? monitor.region
  const lines: string[] = []

  switch (event.type) {
    case 'release': {
      lines.push(fmt(messages.notificationReleased, { name }))
      const dateText = asString(p.releaseDateText)
      if (dateText) lines.push(fmt(messages.notificationReleaseDate, { date: dateText }))
      break
    }
    case 'release_date': {
      const dateText = asString(p.releaseDateText)
      const previous = asString(p.previousReleaseDateText)
      if (dateText) {
        lines.push(fmt(messages.notificationReleaseDateAnnounced, { date: dateText }))
      }
      if (previous) {
        lines.push(fmt(messages.notificationPreviousReleaseDate, { date: previous }))
      }
      break
    }
    case 'sale_start': {
      const initial = asString(p.priceInitialFormatted)
      const final = asString(p.priceFinalFormatted)
      const discount = asNumber(p.discountPercent) ?? 0
      const threshold = asNumber(p.threshold)
      lines.push(
        fmt(messages.notificationCurrentPrice, {
          price: formatPriceLine(initial, final, discount),
        }),
      )
      if (threshold !== null) {
        lines.push(fmt(messages.notificationThresholdReached, { threshold }))
      }
      break
    }
    case 'sale_change': {
      const oldDiscount = asNumber(p.oldDiscountPercent) ?? 0
      const discount = asNumber(p.discountPercent) ?? 0
      const oldFinal = asString(p.oldPriceFinalFormatted)
      const final = asString(p.priceFinalFormatted)
      lines.push(
        fmt(messages.notificationDiscountChange, {
          old: oldDiscount,
          new: discount,
        }),
      )
      if (oldFinal && final) {
        lines.push(fmt(messages.notificationPriceChange, { old: oldFinal, new: final }))
      }
      break
    }
    case 'sale_end': {
      const initial = asString(p.priceInitialFormatted)
      const oldDiscount = asNumber(p.oldDiscountPercent)
      lines.push(
        initial
          ? fmt(messages.notificationSaleEndedWithPrice, { price: initial })
          : messages.notificationSaleEnded,
      )
      if (oldDiscount) {
        lines.push(fmt(messages.notificationPreviousDiscount, { discount: oldDiscount }))
      }
      break
    }
    case 'price_change': {
      const oldInitial = asString(p.oldPriceInitialFormatted)
      const initial = asString(p.priceInitialFormatted)
      const oldFree = p.oldIsFree === true
      const free = p.isFree === true
      if (oldFree !== free) {
        if (free) {
          lines.push(messages.notificationBecameFree)
        } else if (initial) {
          lines.push(fmt(messages.notificationBecamePaidWithPrice, { price: initial }))
        } else {
          lines.push(messages.notificationBecamePaid)
        }
      } else {
        lines.push(
          fmt(messages.notificationBasePriceChange, {
            old: oldInitial ?? '—',
            new: initial ?? '—',
          }),
        )
      }
      break
    }
    case 'delisting_warning': {
      const newsTitle = asString(p.title) ?? messages.notificationSteamNewsFallback
      const keyword = asString(p.matchedKeyword)
      const newsUrl = asString(p.url)
      lines.push(fmt(messages.notificationSteamNews, { title: newsTitle }))
      if (keyword) lines.push(fmt(messages.notificationMatchedKeyword, { keyword }))
      lines.push(messages.notificationDelistingHint)
      if (newsUrl) lines.push(fmt(messages.notificationNewsLink, { url: newsUrl }))
      break
    }
    case 'delisted': {
      lines.push(messages.notificationDelistedConfirmed)
      lines.push(fmt(messages.notificationRegion, { region }))
      break
    }
    case 'restored': {
      lines.push(
        p.firstAvailable === true
          ? fmt(messages.notificationRestoredFirst, { region })
          : fmt(messages.notificationRestored, { region }),
      )
      const final = asString(p.priceFinalFormatted)
      const discount = asNumber(p.discountPercent) ?? 0
      if (final) {
        lines.push(
          fmt(messages.notificationCurrentPrice, {
            price: formatPriceLine(null, final, discount),
          }),
        )
      }
      break
    }
    case 'check_error': {
      const failures = asNumber(p.consecutiveFailures) ?? 0
      const code = asString(p.errorCode) ?? 'unknown'
      lines.push(fmt(messages.notificationCheckFailed, { count: failures, code }))
      if (p.autoPaused === true) lines.push(messages.notificationAutoPaused)
      break
    }
    default:
      break
  }

  lines.push(
    fmt(messages.notificationEntry, {
      name,
      appid: monitor.appid,
    }),
  )
  lines.push(fmt(messages.notificationRegion, { region }))
  return lines
}

function buildFooter(
  event: MonitorEvent,
  timezone: string | null,
  messages: BotMessages,
): string {
  return fmt(messages.notificationFooter, {
    app: messages.appName,
    time: formatDateTime(event.createdAt, timezone),
  })
}

export function renderEventMessage(
  event: MonitorEvent,
  monitor: MonitorRow,
  timezone: string | null,
  locale: string | null | undefined = 'zh-CN',
): RenderedMessage {
  const messages = botMessages(locale)
  const name = asString(event.payload.name) ?? monitor.name
  const storeUrl = asString(event.payload.storeUrl) ?? monitor.store_url
  const title = eventTitle(event.type, name, messages)
  const lines = buildEventLines(event, monitor, messages)
  const footer = buildFooter(event, timezone, messages)
  const markdown = `**${title}**\n${lines.join('\n')}\n[${messages.notificationViewOnSteam}](${storeUrl})\n${footer}`
  const text = `${title}\n${lines.join('\n')}\n${storeUrl}\n${footer}`

  const htmlLines = lines.map((line) => `<p style="margin:4px 0">${escapeHtml(line)}</p>`).join('')
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1b2838;padding:20px;color:#c7d5e0">
  <div style="max-width:560px;margin:0 auto;background:#2a475e;border-radius:8px;overflow:hidden">
    <div style="background:#171a21;padding:16px 20px">
      <h2 style="margin:0;font-size:18px;color:#ffffff">${escapeHtml(title)}</h2>
    </div>
    <div style="padding:16px 20px;font-size:14px;line-height:1.6">${htmlLines}
      <p style="margin:16px 0">
        <a href="${escapeHtml(storeUrl)}" style="display:inline-block;background:#66c0f4;color:#171a21;padding:8px 16px;border-radius:4px;text-decoration:none;font-weight:600">${escapeHtml(messages.notificationViewOnSteam)}</a>
      </p>
      <p style="margin:12px 0 0;color:#8f98a0;font-size:12px">${escapeHtml(footer)}</p>
    </div>
  </div>
</div>`

  const card: FeishuCard = {
    config: { wide_screen_mode: true },
    header: {
      template: FEISHU_TEMPLATES[event.severity],
      title: { tag: 'plain_text', content: title },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: messages.notificationViewOnSteam },
            url: storeUrl,
            type: 'default',
          },
        ],
      },
      { tag: 'note', elements: [{ tag: 'plain_text', content: footer }] },
    ],
  }

  const webhook: WebhookPayload = {
    source: 'steamgames-monitor',
    version: 1,
    kind: 'event',
    eventId: event.id,
    eventType: event.type,
    severity: event.severity,
    title,
    text,
    markdown,
    html,
    monitor: {
      id: monitor.id,
      appid: monitor.appid,
      name,
      storeUrl,
      region: asString(event.payload.region) ?? monitor.region,
      language: monitor.language,
    },
    data: event.payload,
    createdAt: event.createdAt,
    timestamp: new Date(event.createdAt).toISOString(),
  }

  return {
    title,
    markdown,
    card,
    subject: title,
    text,
    html,
    webhook,
  }
}

export function renderTestMessage(
  channelName: string,
  timezone: string | null,
  locale: string | null | undefined = 'zh-CN',
): RenderedMessage {
  const messages = botMessages(locale)
  const now = Date.now()
  const title = messages.notificationTestTitle
  const lines = [
    fmt(messages.notificationTestChannelOk, { channel: channelName }),
    messages.notificationTestHint,
    buildFooter(
      {
        id: 0,
        monitorId: 0,
        userId: 0,
        type: 'sale_start',
        severity: 'info',
        payload: {},
        source: 'test',
        createdAt: now,
      },
      timezone,
      messages,
    ),
  ]
  const markdown = `**${title}**\n${lines.join('\n')}`
  const text = `${title}\n${lines.join('\n')}`
  const htmlLines = lines.map((line) => `<p style="margin:4px 0">${escapeHtml(line)}</p>`).join('')
  const html = `<div style="font-family:sans-serif;background:#1b2838;padding:20px;color:#c7d5e0">
  <div style="max-width:560px;margin:0 auto;background:#2a475e;border-radius:8px;padding:16px 20px">
    <h2 style="margin:0 0 12px;color:#fff;font-size:18px">${escapeHtml(title)}</h2>
    ${htmlLines}
  </div>
</div>`
  const card: FeishuCard = {
    config: { wide_screen_mode: true },
    header: { template: 'turquoise', title: { tag: 'plain_text', content: title } },
    elements: [{ tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } }],
  }
  const webhook: WebhookPayload = {
    source: 'steamgames-monitor',
    version: 1,
    kind: 'test',
    eventId: null,
    eventType: null,
    severity: null,
    title,
    text,
    markdown,
    html,
    monitor: null,
    data: {},
    createdAt: now,
    timestamp: new Date(now).toISOString(),
  }
  return { title, markdown, card, subject: title, text, html, webhook }
}
