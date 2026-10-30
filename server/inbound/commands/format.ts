import type { EventType, MonitorEvent } from '../../../shared/types'
import { EVENT_META } from '../../../shared/constants'
import {
  eventTypeLabel,
  formatDateTime,
  formatDiscount,
  truncateUtf8,
  utf8Bytes,
} from '../../../shared/utils'
import type { MonitorRow } from '../../db/rows'

export function monitorStatusLabel(monitor: MonitorRow): string {
  if (monitor.enabled !== 1) return '已暂停'
  if (monitor.availability === 'unavailable') return '不可用'
  if (monitor.release_status === 'coming_soon') return '即将发售'
  if (monitor.availability === 'unknown') return '待检查'
  if (Number(monitor.discount_percent) > 0) return '促销中'
  return '在售'
}

export function monitorPriceText(monitor: MonitorRow): string {
  if (monitor.is_free === 1) return '免费'
  const final = monitor.price_final_formatted
  const discount = Number(monitor.discount_percent)
  if (final) return `${final}${discount > 0 ? `（-${discount}%）` : ''}`
  if (monitor.price_initial_formatted) return monitor.price_initial_formatted
  return '暂无价格'
}

export function formatMonitorLine(monitor: MonitorRow): string {
  return `#${monitor.id} ${monitor.name}（${monitor.appid}）· ${monitorStatusLabel(monitor)} · ${monitorPriceText(monitor)}`
}

export function formatMonitorDetail(monitor: MonitorRow, timezone: string | null): string {
  const lines = [
    `#${monitor.id} ${monitor.name}`,
    `AppID：${monitor.appid}${monitor.parent_appid ? `（DLC，本体 ${monitor.parent_appid}）` : ''}`,
    `状态：${monitorStatusLabel(monitor)}`,
    `价格：${monitorPriceText(monitor)}`,
  ]
  if (monitor.price_initial_formatted && Number(monitor.discount_percent) > 0) {
    lines.push(`原价：${monitor.price_initial_formatted}`)
  }
  if (monitor.release_date_text) lines.push(`发售日期：${monitor.release_date_text}`)
  lines.push(`最低折扣：${monitor.min_discount_percent ?? '跟随账号设置'}`)
  lines.push(`区域 / 语言：${monitor.region} / ${monitor.language}`)
  lines.push(
    `上次检查：${monitor.last_check_at ? formatDateTime(Number(monitor.last_check_at), timezone) : '尚未检查'}`,
  )
  if (monitor.consecutive_failures > 0) lines.push(`连续失败：${monitor.consecutive_failures}`)
  if (monitor.notes) lines.push(`备注：${monitor.notes}`)
  lines.push(`商店：${monitor.store_url}`)
  return lines.join('\n')
}

export function formatEventLine(event: MonitorEvent, timezone: string | null, name?: string): string {
  const title = name ?? (typeof event.payload.name === 'string' ? event.payload.name : `#${event.monitorId}`)
  const time = formatDateTime(event.createdAt, timezone)
  const label = eventTypeLabel(event.type)
  const discount = typeof event.payload.discountPercent === 'number' ? event.payload.discountPercent : null
  const suffix = discount !== null && discount > 0 ? ` · ${formatDiscount(discount)}` : ''
  return `${time} · ${label} · ${title}${suffix}`
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

export function formatEventType(type: string): string {
  return EVENT_META[type as EventType]?.label ?? type
}

export function truncateForReply(text: string, maxBytes = 3500): string {
  return truncateUtf8(text, maxBytes)
}
