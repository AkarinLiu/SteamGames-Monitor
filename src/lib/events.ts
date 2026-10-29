import type { EventPayload, EventType } from '@shared/types'

export function payloadString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number') return String(value)
  return null
}

export function eventSummary(type: EventType, payload: EventPayload): string {
  switch (type) {
    case 'release':
      return payloadString(payload.releaseDateText)
        ? `发售日期 ${payloadString(payload.releaseDateText)}`
        : '游戏已发售'
    case 'sale_start':
      return `折扣 ${payloadString(payload.discountPercent) ?? '?'}%${
        payloadString(payload.priceFinalFormatted)
          ? `，现价 ${payloadString(payload.priceFinalFormatted)}`
          : ''
      }`
    case 'sale_change':
      return `折扣 ${payloadString(payload.oldDiscountPercent) ?? '?'}% → ${
        payloadString(payload.discountPercent) ?? '?'
      }%${
        payloadString(payload.priceFinalFormatted)
          ? `，现价 ${payloadString(payload.priceFinalFormatted)}`
          : ''
      }`
    case 'sale_end':
      return `促销结束，恢复原价${
        payloadString(payload.priceInitialFormatted)
          ? ` ${payloadString(payload.priceInitialFormatted)}`
          : ''
      }`
    case 'price_change': {
      if (payload.oldIsFree === true && payload.isFree === false) return '由免费转为付费'
      if (payload.oldIsFree === false && payload.isFree === true) return '转为免费'
      return `原价 ${payloadString(payload.oldPriceInitialFormatted) ?? '?'} → ${
        payloadString(payload.priceInitialFormatted) ?? '?'
      }`
    }
    case 'delisting_warning':
      return `匹配关键词「${payloadString(payload.matchedKeyword) ?? '—'}」：${
        payloadString(payload.title) ?? '新闻公告'
      }`
    case 'delisted':
      return `连续 ${payloadString(payload.consecutiveUnavailable) ?? '2'} 次检查确认无法购买`
    case 'restored':
      return payload.firstAvailable === true ? '首次确认可购买' : '已恢复可购买'
    case 'check_error':
      return `连续失败 ${payloadString(payload.consecutiveFailures) ?? '?'} 次（${
        payloadString(payload.errorCode) ?? '未知错误'
      }）`
    default:
      return ''
  }
}

export function newsUrlOf(payload: EventPayload): string | null {
  const url = payloadString(payload.url)
  return url && /^https?:\/\//.test(url) ? url : null
}
