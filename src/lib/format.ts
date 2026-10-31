import { t, tf, uiLocale } from '@/i18n'
import { EVENT_META } from '@shared/constants'
import type { Availability, EventType, Monitor, ReleaseStatus } from '@shared/types'

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

const INTL_LOCALES: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  'ko-KP': 'ko-KP',
  nl: 'nl-NL',
  ru: 'ru-RU',
}

function intlLocale(): string {
  return INTL_LOCALES[uiLocale.value] ?? 'zh-CN'
}

function formatterFor(timezone: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${uiLocale.value}:${timezone}:${withTime ? 'dt' : 'd'}`
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale(), {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      hour12: false,
    })
    dateFormatters.set(key, formatter)
  }
  return formatter
}

export function formatDateTime(value: number | null | undefined, timezone = 'UTC'): string {
  if (value === null || value === undefined) return '—'
  try {
    return formatterFor(timezone, true).format(value)
  } catch {
    return new Date(value).toLocaleString(intlLocale())
  }
}

export function formatDate(value: number | null | undefined, timezone = 'UTC'): string {
  if (value === null || value === undefined) return '—'
  try {
    return formatterFor(timezone, false).format(value)
  } catch {
    return new Date(value).toLocaleDateString(intlLocale())
  }
}

export function formatRelative(value: number | null | undefined, now = Date.now()): string {
  if (value === null || value === undefined) return '—'
  const diff = value - now
  const minutes = Math.round(diff / 60_000)
  if (Math.abs(minutes) < 1) return t('刚刚')
  if (Math.abs(minutes) < 60) {
    return minutes > 0
      ? tf("{minutes} 分钟后", { minutes })
      : tf("{minutes} 分钟前", { minutes: -minutes })
  }
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) {
    return hours > 0
      ? tf("{hours} 小时后", { hours })
      : tf("{hours} 小时前", { hours: -hours })
  }
  const days = Math.round(hours / 24)
  return days > 0 ? tf("{days} 天后", { days }) : tf("{days} 天前", { days: -days })
}

export function formatPollInterval(seconds: number): string {
  if (seconds % 3600 === 0) return tf("{hours} 小时", { hours: seconds / 3600 })
  return tf("{minutes} 分钟", { minutes: Math.round(seconds / 60) })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value.toFixed(1)} ${unit}`
}

export function availabilityLabel(status: Availability): string {
  if (status === 'available') return t("可购买")
  if (status === 'unavailable') return t("不可购买")
  return t("待首次检查")
}

export function availabilityBadge(status: Availability): string {
  if (status === 'available') return 'badge-green'
  if (status === 'unavailable') return 'badge-danger'
  return 'badge-neutral'
}

export function releaseLabel(status: ReleaseStatus, dateText: string | null): string {
  if (status === 'coming_soon') {
    return dateText ? tf("即将发售 · {date}", { date: dateText }) : t('即将发售')
  }
  if (status === 'released') return t('已发售')
  return t('发售状态未知')
}

export function monitorStatusLabel(monitor: Monitor): string {
  if (!monitor.enabled) return t("已暂停")
  if (monitor.baselinePending) return t("等待基线检查")
  if (monitor.availability === 'unavailable') {
    return monitor.consecutiveUnavailable >= 2 ? t("已下架 / 不可购买") : t("疑似不可用")
  }
  if (monitor.availability === 'unknown') return t("待检查")
  if (monitor.discountPercent > 0) {
    return tf("促销中 -{discount}%", { discount: monitor.discountPercent })
  }
  if (monitor.releaseStatus === 'coming_soon') return t('即将发售')
  return t('正常在售')
}

export function monitorStatusTone(monitor: Monitor): string {
  if (!monitor.enabled) return 'badge-neutral'
  if (monitor.availability === 'unavailable') return 'badge-danger'
  if (monitor.baselinePending || monitor.availability === 'unknown') return 'badge-neutral'
  if (monitor.discountPercent > 0) return 'badge-green'
  if (monitor.releaseStatus === 'coming_soon') return 'badge-accent'
  return 'badge-accent'
}

export function eventLabel(type: EventType): string {
  return t(EVENT_META[type]?.label ?? type)
}

export function eventBadge(type: EventType): string {
  const severity = EVENT_META[type]?.severity ?? 'info'
  if (severity === 'critical') return 'badge-danger'
  if (severity === 'warning') return 'badge-warning'
  return 'badge-accent'
}

export function priceText(monitor: Monitor): string {
  if (monitor.isFree) return t('免费')
  return monitor.priceFinalFormatted ?? '—'
}

export function initialPriceText(monitor: Monitor): string {
  if (monitor.discountPercent <= 0) return ''
  return monitor.priceInitialFormatted ?? ''
}

export function discountText(monitor: Monitor): string {
  if (monitor.discountPercent <= 0) return ''
  return `-${monitor.discountPercent}%`
}
