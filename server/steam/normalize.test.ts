import { describe, expect, it } from 'vitest'
import { normalizeAppDetails, withPriceState } from './normalize'
import type { NormalizedApp } from './types'

function details(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'game',
    steam_appid: 929140,
    name: 'Tank Royale',
    is_free: false,
    release_date: { coming_soon: false, date: '1 Apr, 2019' },
    ...overrides,
  }
}

describe('normalizeAppDetails price state', () => {
  it('reads a purchasable price', () => {
    const app = normalizeAppDetails(929140, details({
      price_overview: {
        currency: 'CNY',
        initial: 3700,
        final: 3700,
        discount_percent: 0,
        initial_formatted: 'CNY 37.00',
        final_formatted: 'CNY 37.00',
      },
    }))
    expect(app?.priceState).toEqual({
      status: 'priced',
      price: {
        currency: 'CNY',
        initialRaw: 3700,
        finalRaw: 3700,
        discountPercent: 0,
        initialFormatted: 'CNY 37.00',
        finalFormatted: 'CNY 37.00',
      },
    })
  })

  it('treats a delisted app without packages as no longer sold', () => {
    // Live response for appid 929140 (delisted): success, no price_overview, no packages.
    expect(normalizeAppDetails(929140, details())?.priceState).toEqual({
      status: 'unavailable',
      reason: 'not_sold',
    })
  })

  it('treats an app that still lists packages as simply unpriced', () => {
    expect(normalizeAppDetails(1, details({ packages: [123] }))?.priceState).toEqual({
      status: 'unavailable',
      reason: 'no_price',
    })
  })

  it('keeps free apps as free', () => {
    expect(normalizeAppDetails(1, details({ is_free: true }))?.priceState).toEqual({
      status: 'free',
    })
  })

  it('does not treat an unreleased app as delisted', () => {
    expect(
      normalizeAppDetails(1, details({ release_date: { coming_soon: true, date: 'Q4 2026' } }))
        ?.priceState,
    ).toEqual({ status: 'unavailable', reason: 'not_on_sale_yet' })
  })

  it('marks an unparsable price_overview as unknown', () => {
    expect(normalizeAppDetails(1, details({ price_overview: {} }))?.priceState).toEqual({
      status: 'unknown',
    })
  })
})

describe('withPriceState', () => {
  const base: NormalizedApp = {
    appid: 929140,
    kind: 'game',
    name: 'Tank Royale',
    isFree: false,
    release: { comingSoon: false, dateText: '1 Apr, 2019' },
    price: null,
    dlcIds: [],
    fullgame: null,
    headerImage: null,
    shortDescription: null,
  }

  it('leaves an app that already has a price state alone', () => {
    const priced = { ...base, price: { currency: 'CNY', initialRaw: 1, finalRaw: 1, discountPercent: 0, initialFormatted: 'CNY 0.01', finalFormatted: 'CNY 0.01' } }
    const app = withPriceState(priced)
    expect(app.priceState?.status).toBe('priced')
  })

  it('marks a cached app without a price as unavailable', () => {
    expect(withPriceState(base).priceState).toEqual({ status: 'unavailable', reason: 'not_sold' })
  })
})
