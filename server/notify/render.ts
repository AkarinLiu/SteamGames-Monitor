import type { EventSeverity, EventType, MonitorEvent } from '../../shared/types'
import { escapeHtml, formatDateTime, formatPriceLine } from '../../shared/utils'
import type { MonitorRow } from '../db/rows'
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

function eventTitle(type: EventType, name: string): string {
  switch (type) {
    case 'release':
      return `【发售】${name}`
    case 'sale_start':
      return `【促销开始】${name}`
    case 'sale_change':
      return `【促销变化】${name}`
    case 'sale_end':
      return `【促销结束】${name}`
    case 'price_change':
      return `【价格变动】${name}`
    case 'delisting_warning':
      return `【下架预警·启发式】${name}`
    case 'delisted':
      return `【已下架 / 不可购买】${name}`
    case 'restored':
      return `【恢复可售】${name}`
    case 'check_error':
      return `【检查异常】${name}`
    default:
      return `【${String(type)}】${name}`
  }
}

function buildEventLines(event: MonitorEvent, monitor: MonitorRow): string[] {
  const p = event.payload
  const name = asString(p.name) ?? monitor.name
  const region = asString(p.region) ?? monitor.region
  const lines: string[] = []

  switch (event.type) {
    case 'release': {
      lines.push(`「${name}」已正式发售。`)
      const dateText = asString(p.releaseDateText)
      if (dateText) lines.push(`发售日期：${dateText}`)
      break
    }
    case 'sale_start': {
      const initial = asString(p.priceInitialFormatted)
      const final = asString(p.priceFinalFormatted)
      const discount = asNumber(p.discountPercent) ?? 0
      const threshold = asNumber(p.threshold)
      lines.push(`当前价格：${formatPriceLine(initial, final, discount)}`)
      if (threshold !== null) lines.push(`已达到监控阈值 ${threshold}%`)
      break
    }
    case 'sale_change': {
      const oldDiscount = asNumber(p.oldDiscountPercent) ?? 0
      const discount = asNumber(p.discountPercent) ?? 0
      const oldFinal = asString(p.oldPriceFinalFormatted)
      const final = asString(p.priceFinalFormatted)
      lines.push(`折扣变化：${oldDiscount}% → ${discount}%`)
      if (oldFinal && final) lines.push(`价格变化：${oldFinal} → ${final}`)
      break
    }
    case 'sale_end': {
      const initial = asString(p.priceInitialFormatted)
      const oldDiscount = asNumber(p.oldDiscountPercent)
      lines.push(`促销结束，恢复原价${initial ? `：${initial}` : ''}`)
      if (oldDiscount) lines.push(`此前折扣 ${oldDiscount}%`)
      break
    }
    case 'price_change': {
      const oldInitial = asString(p.oldPriceInitialFormatted)
      const initial = asString(p.priceInitialFormatted)
      const oldFree = p.oldIsFree === true
      const free = p.isFree === true
      if (oldFree !== free) {
        lines.push(free ? '该商品已变为免费。' : `该商品已从免费转为付费${initial ? `：${initial}` : ''}。`)
      } else {
        lines.push(`原价变化：${oldInitial ?? '—'} → ${initial ?? '—'}`)
      }
      break
    }
    case 'delisting_warning': {
      const newsTitle = asString(p.title) ?? 'Steam 新闻'
      const keyword = asString(p.matchedKeyword)
      const newsUrl = asString(p.url)
      lines.push(`Steam 新闻：「${newsTitle}」`)
      if (keyword) lines.push(`命中关键词：${keyword}`)
      lines.push('这是基于新闻关键词的启发式预警，请人工确认是否即将下架。')
      if (newsUrl) lines.push(`新闻链接：${newsUrl}`)
      break
    }
    case 'delisted': {
      lines.push('连续 2 次检查确认该商品在商店中无法购买。')
      lines.push(`区域：${region}`)
      break
    }
    case 'restored': {
      if (p.firstAvailable === true) {
        lines.push(`该商品现在可以在区域 ${region} 购买。`)
      } else {
        lines.push(`该商品已恢复可购买（区域 ${region}）。`)
      }
      const final = asString(p.priceFinalFormatted)
      const discount = asNumber(p.discountPercent) ?? 0
      if (final) lines.push(`当前价格：${formatPriceLine(null, final, discount)}`)
      break
    }
    case 'check_error': {
      const failures = asNumber(p.consecutiveFailures) ?? 0
      const code = asString(p.errorCode) ?? 'unknown'
      lines.push(`连续 ${failures} 次检查失败（${code}）。`)
      if (p.autoPaused === true) lines.push('已自动暂停该监控项，请检查后手动恢复。')
      break
    }
    default:
      break
  }

  lines.push(`条目：${name}（appid ${monitor.appid}）`)
  lines.push(`区域：${region}`)
  return lines
}

function buildFooter(event: MonitorEvent, timezone: string | null): string {
  return `Steam 监控 · ${formatDateTime(event.createdAt, timezone)}`
}

export function renderEventMessage(
  event: MonitorEvent,
  monitor: MonitorRow,
  timezone: string | null,
): RenderedMessage {
  const name = asString(event.payload.name) ?? monitor.name
  const storeUrl = asString(event.payload.storeUrl) ?? monitor.store_url
  const title = eventTitle(event.type, name)
  const lines = buildEventLines(event, monitor)
  const footer = buildFooter(event, timezone)
  const markdown = `**${title}**\n${lines.join('\n')}\n[在 Steam 查看](${storeUrl})\n${footer}`
  const text = `${title}\n${lines.join('\n')}\n${storeUrl}\n${footer}`

  const htmlLines = lines.map((line) => `<p style="margin:4px 0">${escapeHtml(line)}</p>`).join('')
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1b2838;padding:20px;color:#c7d5e0">
  <div style="max-width:560px;margin:0 auto;background:#2a475e;border-radius:8px;overflow:hidden">
    <div style="background:#171a21;padding:16px 20px">
      <h2 style="margin:0;font-size:18px;color:#ffffff">${escapeHtml(title)}</h2>
    </div>
    <div style="padding:16px 20px;font-size:14px;line-height:1.6">${htmlLines}
      <p style="margin:16px 0">
        <a href="${escapeHtml(storeUrl)}" style="display:inline-block;background:#66c0f4;color:#171a21;padding:8px 16px;border-radius:4px;text-decoration:none;font-weight:600">在 Steam 查看</a>
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
            text: { tag: 'plain_text', content: '在 Steam 查看' },
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
): RenderedMessage {
  const now = Date.now()
  const title = '【测试通知】Steam 监控'
  const lines = [
    `通知渠道「${channelName}」配置成功。`,
    '如果你收到这条消息，说明此渠道可以正常接收监控通知。',
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
