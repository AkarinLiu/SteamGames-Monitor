import { EVENT_META } from '../constants'
import type { EventType } from '../types'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

export function truncateUtf8(text: string, maxBytes: number, suffix = '…'): string {
  if (maxBytes <= 0) return ''
  if (utf8Bytes(text) <= maxBytes) return text
  const suffixBytes = utf8Bytes(suffix)
  const budget = Math.max(0, maxBytes - suffixBytes)
  let bytes = 0
  let out = ''
  for (const char of text) {
    const size = utf8Bytes(char)
    if (bytes + size > budget) break
    bytes += size
    out += char
  }
  return out + suffix
}

export function truncateText(text: string, maxChars: number, suffix = '…'): string {
  const chars = Array.from(text)
  if (chars.length <= maxChars) return text
  return chars.slice(0, Math.max(0, maxChars - suffix.length)).join('') + suffix
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function parseJsonObject(text: string): Record<string, unknown> {
  return safeJsonParse<Record<string, unknown>>(text, {})
}

export function formatDateTime(
  value: number | Date | null | undefined,
  timezone?: string | null,
  withSeconds = false,
): string {
  if (value === null || value === undefined) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone || 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: false,
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

export function formatRelativeTime(value: number | null | undefined, now = Date.now()): string {
  if (value === null || value === undefined) return '—'
  const diff = now - value
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? '前' : '后'
  if (abs < 60_000) return diff >= 0 ? '刚刚' : '即将'
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)} 分钟${suffix}`
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)} 小时${suffix}`
  return `${Math.floor(abs / 86_400_000)} 天${suffix}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let value = bytes
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatDiscount(percent: number | null | undefined): string {
  if (!percent || percent <= 0) return ''
  return `-${percent}%`
}

export function formatPriceLine(
  initial: string | null | undefined,
  final: string | null | undefined,
  discount: number,
): string {
  if (initial && final && discount > 0) {
    return `${initial} → ${final}（-${discount}%）`
  }
  if (final) return final
  if (initial) return initial
  return '免费'
}

export function eventTypeLabel(type: EventType): string {
  return EVENT_META[type]?.label ?? type
}

export function eventSeverity(type: EventType) {
  return EVENT_META[type]?.severity ?? 'info'
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase()
}

export function normalizeKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of keywords) {
    const keyword = raw.trim()
    if (!keyword) continue
    const key = normalizeKeyword(keyword)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(keyword)
  }
  return result
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isSteamAppUrl(text: string): boolean {
  return /store\.steampowered\.com\/app\/\d+/i.test(text)
}

export function extractAppid(text: string): number | null {
  const trimmed = text.trim()
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  const urlMatch = trimmed.match(/store\.steampowered\.com\/app\/(\d+)/i)
  if (urlMatch?.[1]) {
    const value = Number(urlMatch[1])
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  return null
}

export function buildStoreUrl(appid: number): string {
  return `https://store.steampowered.com/app/${appid}/`
}

export function buildStoreImageUrl(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
}
