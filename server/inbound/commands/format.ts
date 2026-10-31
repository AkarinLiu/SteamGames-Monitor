import type { MonitorEvent } from '../../../shared/types'
import {
  formatDateTime,
  truncateUtf8,
  utf8Bytes,
} from '../../../shared/utils'
import type { MonitorRow } from '../../db/rows'
import type { BotMessages } from '../../i18n'
import { eventLabel, formatBotMessage as fmt } from '../../i18n'

export function monitorStatusLabel(monitor: MonitorRow, messages: BotMessages): string {
  if (monitor.enabled !== 1) return messages.statusPaused
  if (monitor.availability === 'unavailable') return messages.statusUnavailable
  if (monitor.delisting_warning_at) return messages.statusDelistingSoon
  if (monitor.release_status === 'coming_soon') return messages.statusComingSoon
  if (monitor.availability === 'unknown') return messages.statusUnknown
  if (Number(monitor.discount_percent) > 0) return messages.statusOnSale
  return messages.statusAvailable
}

export function monitorPriceText(monitor: MonitorRow, messages: BotMessages): string {
  if (monitor.is_free === 1) return messages.priceFree
  const final = monitor.price_final_formatted
  const discount = Number(monitor.discount_percent)
  if (final) {
    return discount > 0
      ? fmt(messages.priceWithDiscount, { price: final, discount })
      : final
  }
  if (monitor.price_initial_formatted) return monitor.price_initial_formatted
  return messages.priceNone
}

export function formatMonitorLine(monitor: MonitorRow, messages: BotMessages): string {
  return fmt(messages.monitorLine, {
    id: monitor.id,
    name: monitor.name,
    appid: monitor.appid,
    status: monitorStatusLabel(monitor, messages),
    price: monitorPriceText(monitor, messages),
  })
}

export function formatMonitorDetail(
  monitor: MonitorRow,
  timezone: string | null,
  messages: BotMessages,
): string {
  const lines = [
    `#${monitor.id} ${monitor.name}`,
    monitor.parent_appid
      ? fmt(messages.appidWithParent, { appid: monitor.appid, parent: monitor.parent_appid })
      : fmt(messages.appidOnly, { appid: monitor.appid }),
    fmt(messages.detailStatus, { status: monitorStatusLabel(monitor, messages) }),
    fmt(messages.detailPrice, { price: monitorPriceText(monitor, messages) }),
  ]
  if (monitor.price_initial_formatted && Number(monitor.discount_percent) > 0) {
    lines.push(fmt(messages.detailInitialPrice, { price: monitor.price_initial_formatted }))
  }
  if (monitor.release_date_text) {
    lines.push(fmt(messages.detailReleaseDate, { date: monitor.release_date_text }))
  }
  lines.push(
    fmt(messages.detailMinDiscount, {
      discount: monitor.min_discount_percent ?? messages.followAccount,
    }),
  )
  lines.push(
    fmt(messages.detailRegionLanguage, {
      region: monitor.region,
      language: monitor.language,
    }),
  )
  lines.push(
    fmt(messages.detailLastCheck, {
      time: monitor.last_check_at
        ? formatDateTime(Number(monitor.last_check_at), timezone)
        : messages.neverChecked,
    }),
  )
  if (monitor.consecutive_failures > 0) {
    lines.push(fmt(messages.detailFailures, { count: monitor.consecutive_failures }))
  }
  if (monitor.notes) lines.push(fmt(messages.detailNotes, { notes: monitor.notes }))
  lines.push(fmt(messages.detailStore, { url: monitor.store_url }))
  return lines.join('\n')
}

export function formatEventLine(
  event: MonitorEvent,
  timezone: string | null,
  name: string | undefined,
  messages: BotMessages,
): string {
  const title =
    name ??
    (typeof event.payload.name === 'string' ? event.payload.name : `#${event.monitorId}`)
  const time = formatDateTime(event.createdAt, timezone)
  const discount =
    typeof event.payload.discountPercent === 'number' ? event.payload.discountPercent : null
  const suffix =
    discount !== null && discount > 0
      ? fmt(messages.eventDiscountSuffix, { discount: discount })
      : ''
  return fmt(messages.eventLine, {
    time,
    type: eventLabel(event.type, messages),
    name: title,
    suffix,
  })
}

function splitByLimit(text: string, limit: number, measure: (value: string) => number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current) chunks.push(current)
    current = ''
  }
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line
    if (measure(candidate) <= limit) {
      current = candidate
      continue
    }
    flush()
    if (measure(line) <= limit) {
      current = line
      continue
    }
    let rest = line
    while (measure(rest) > limit) {
      let cut = rest.length
      while (cut > 0 && measure(rest.slice(0, cut)) > limit) cut -= 1
      if (cut <= 0) cut = 1
      chunks.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    current = rest
  }
  flush()
  return chunks.length > 0 ? chunks : ['']
}

export function formatDingtalkMarkdown(text: string): string {
  // DingTalk collapses a bare newline into a space; markdown line breaks need
  // two trailing spaces.
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? `${line.replace(/[ \t]+$/, '')}  ` : ''))
    .join('\n')
}

export function splitReply(
  text: string,
  platform: 'feishu' | 'dingtalk' | 'wecom',
): string[] {
  const limit = platform === 'wecom' ? 1800 : 4000
  const measure = platform === 'wecom' ? utf8Bytes : (value: string) => value.length
  const chunks = splitByLimit(text, limit - 10, measure)
  if (chunks.length <= 1) return chunks
  return chunks.map((chunk, index) => `(${index + 1}/${chunks.length}) ${chunk}`)
}

export function truncateForReply(text: string, maxBytes = 3500): string {
  return truncateUtf8(text, maxBytes)
}
