import { t, tf } from '@/i18n'
import type { EventPayload, EventType } from '@shared/types'

export function payloadString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number') return String(value)
  return null
}

export function eventSummary(type: EventType, payload: EventPayload): string {
  switch (type) {
    case 'release': {
      const date = payloadString(payload.releaseDateText)
      return date ? tf('发售日期 {date}', { date }) : t('游戏已发售')
    }
    case 'sale_start': {
      const price = payloadString(payload.priceFinalFormatted)
      return price
        ? tf("折扣 {discount}%，现价 {price}", {
            discount: payloadString(payload.discountPercent) ?? '?',
            price,
          })
        : tf("折扣 {discount}%", {
            discount: payloadString(payload.discountPercent) ?? '?',
          })
    }
    case 'sale_change': {
      const price = payloadString(payload.priceFinalFormatted)
      return price
        ? tf("折扣 {old}% → {new}%，现价 {price}", {
            old: payloadString(payload.oldDiscountPercent) ?? '?',
            new: payloadString(payload.discountPercent) ?? '?',
            price,
          })
        : tf("折扣 {old}% → {new}%", {
            old: payloadString(payload.oldDiscountPercent) ?? '?',
            new: payloadString(payload.discountPercent) ?? '?',
          })
    }
    case 'sale_end': {
      const price = payloadString(payload.priceInitialFormatted)
      return price
        ? tf("促销结束，恢复原价 {price}", { price })
        : t('促销结束，恢复原价')
    }
    case 'price_change': {
      if (payload.oldIsFree === true && payload.isFree === false) return t('由免费转为付费')
      if (payload.oldIsFree === false && payload.isFree === true) return t('转为免费')
      return tf("原价 {old} → {new}", {
        old: payloadString(payload.oldPriceInitialFormatted) ?? '?',
        new: payloadString(payload.priceInitialFormatted) ?? '?',
      })
    }
    case 'delisting_warning':
      return tf("匹配关键词「{keyword}」：{title}", {
        keyword: payloadString(payload.matchedKeyword) ?? '—',
        title: payloadString(payload.title) ?? t('新闻公告'),
      })
    case 'delisted':
      return tf("连续 {count} 次检查确认无法购买", {
        count: payloadString(payload.consecutiveUnavailable) ?? '2',
      })
    case 'restored':
      return payload.firstAvailable === true ? t('首次确认可购买') : t('已恢复可购买')
    case 'check_error':
      return tf("连续失败 {count} 次（{code}）", {
        count: payloadString(payload.consecutiveFailures) ?? '?',
        code: payloadString(payload.errorCode) ?? t('未知错误'),
      })
    default:
      return ''
  }
}

export function newsUrlOf(payload: EventPayload): string | null {
  const url = payloadString(payload.url)
  return url && /^https?:\/\//.test(url) ? url : null
}
