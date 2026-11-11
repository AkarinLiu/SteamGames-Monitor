import { describe, expect, it } from 'vitest'
import type { Monitor } from '@shared/types'
import {
  availabilityBadge,
  availabilityLabel,
  isPriceUnavailable,
  monitorStatusLabel,
  monitorStatusTone,
} from './format'

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    enabled: true,
    baselinePending: false,
    availability: 'available',
    releaseStatus: 'released',
    delistingWarningAt: null,
    discountPercent: 0,
    priceUnavailable: false,
    isFree: false,
    priceInitialFormatted: null,
    priceFinalFormatted: null,
    ...overrides,
  } as unknown as Monitor
}

describe('isPriceUnavailable', () => {
  it('flags a listed item that lost its price', () => {
    expect(isPriceUnavailable(monitor({ priceUnavailable: true }))).toBe(true)
  })

  it('ignores items that simply have not been released yet', () => {
    expect(
      isPriceUnavailable(monitor({ priceUnavailable: true, releaseStatus: 'coming_soon' })),
    ).toBe(false)
  })

  it('ignores items that are unavailable as a whole', () => {
    expect(isPriceUnavailable(monitor({ priceUnavailable: true, availability: 'unavailable' }))).toBe(
      false,
    )
  })
})

describe('availabilityLabel', () => {
  it('keeps the plain purchasable wording for priced items', () => {
    expect(availabilityLabel('available')).toBe('可购买')
    expect(availabilityBadge('available')).toBe('badge-green')
  })

  it('says the item is listed without a price instead of purchasable', () => {
    expect(availabilityLabel('available', true)).toBe('在售（无价格）')
    expect(availabilityBadge('available', true)).toBe('badge-warning')
  })

  it('does not change genuinely unavailable items', () => {
    expect(availabilityLabel('unavailable', true)).toBe('不可购买')
    expect(availabilityBadge('unavailable', true)).toBe('badge-danger')
  })
})

describe('monitorStatusLabel', () => {
  it('reports a delisted item as listed without a price', () => {
    const item = monitor({ priceUnavailable: true })
    expect(monitorStatusLabel(item)).toBe('在售（无价格）')
    expect(monitorStatusTone(item)).toBe('badge-warning')
  })

  it('still reports an unreleased item as coming soon', () => {
    const item = monitor({ priceUnavailable: true, releaseStatus: 'coming_soon' })
    expect(monitorStatusLabel(item)).toBe('即将发售')
    expect(monitorStatusTone(item)).toBe('badge-accent')
  })

  it('keeps the normal on-sale wording for priced items', () => {
    expect(monitorStatusLabel(monitor())).toBe('正常在售')
  })
})
