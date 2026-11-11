import { describe, expect, it } from 'vitest'
import type { MonitorRow } from '../../db/rows'
import { botMessages } from '../../i18n'
import {
  formatDingtalkMarkdown,
  monitorPriceText,
  monitorStatusLabel,
} from './format'

describe('formatDingtalkMarkdown', () => {
  it('adds two trailing spaces so DingTalk renders line breaks', () => {
    expect(formatDingtalkMarkdown('第一行\n第二行\n\n第三行')).toBe(
      '第一行  \n第二行  \n\n第三行  ',
    )
  })

  it('normalizes CRLF and strips existing trailing whitespace', () => {
    expect(formatDingtalkMarkdown('a\r\nb   \r\nc')).toBe('a  \nb  \nc  ')
  })
})
describe('monitor formatting with no purchasable price', () => {
  const messages = botMessages('zh-CN')

  function monitorRow(overrides: Record<string, unknown> = {}): MonitorRow {
    return {
      id: 1,
      appid: 929140,
      name: 'Tank Royale',
      enabled: 1,
      availability: 'available',
      delisting_warning_at: null,
      release_status: 'released',
      discount_percent: 0,
      price_unavailable: 1,
      is_free: 0,
      price_initial_formatted: null,
      price_final_formatted: null,
      ...overrides,
    } as unknown as MonitorRow
  }

  it('labels a listed item without a price as not purchasable', () => {
    expect(monitorStatusLabel(monitorRow(), messages)).toBe('不可购买')
  })

  it('never shows a stale last known price for it', () => {
    expect(monitorPriceText(monitorRow(), messages)).toBe('无可购买价格')
    expect(
      monitorPriceText(
        monitorRow({ price_unavailable: 0, price_final_formatted: '¥ 37.00' }),
        messages,
      ),
    ).toBe('¥ 37.00')
  })

  it('keeps reporting an unavailable item as unavailable', () => {
    const row = monitorRow({ availability: 'unavailable' })
    expect(monitorStatusLabel(row, messages)).toBe('不可用')
  })
})
