import { describe, expect, it } from 'vitest'
import {
  computeNextCheckAt,
  EARLY_RECHECK_MS,
  MAX_BACKOFF_MS,
  NEWS_INTERVAL_MS,
  COMING_SOON_INTERVAL_MS,
  SALE_INTERVAL_MS,
} from './policies'
import { deriveMonitorUpdate, type MonitorState } from './stateMachine'
import type { NormalizedApp } from '../steam/types'

const NOW = 1_800_000_000_000

function state(overrides: Partial<MonitorState> = {}): MonitorState {
  return {
    baselinePending: false,
    availability: 'available',
    everAvailable: true,
    releaseStatus: 'released',
    releaseDateText: '2020-12-10',
    currency: 'CNY',
    priceInitialRaw: 29800,
    priceFinalRaw: 29800,
    priceInitialFormatted: 'CNY 298.00',
    priceFinalFormatted: '¥ 298.00',
    discountPercent: 0,
    isFree: false,
    saleStartedAt: null,
    unavailableSince: null,
    delistedNotifiedAt: null,
    delistingWarningAt: null,
    consecutiveUnavailable: 0,
    ...overrides,
  }
}

function app(overrides: Partial<NormalizedApp> = {}): NormalizedApp {
  return {
    appid: 1091500,
    kind: 'game',
    name: 'Cyberpunk 2077',
    isFree: false,
    release: { comingSoon: false, dateText: '2020-12-10' },
    price: {
      currency: 'CNY',
      initialRaw: 29800,
      finalRaw: 29800,
      discountPercent: 0,
      initialFormatted: 'CNY 298.00',
      finalFormatted: '¥ 298.00',
    },
    dlcIds: [],
    fullgame: null,
    headerImage: null,
    shortDescription: null,
    ...overrides,
  }
}

function discountApp(percent: number, finalRaw = 29800 - Math.round((29800 * percent) / 100)) {
  return app({
    price: {
      currency: 'CNY',
      initialRaw: 29800,
      finalRaw,
      discountPercent: percent,
      initialFormatted: 'CNY 298.00',
      finalFormatted: `¥ ${(finalRaw / 100).toFixed(2)}`,
    },
  })
}

describe('deriveMonitorUpdate', () => {
  it('suppresses all events during baseline but still records sale anchor', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({ baselinePending: true, availability: 'unknown', everAvailable: false }),
      next: discountApp(50),
      unavailableConfirmed: false,
    })
    expect(result.events).toEqual([])
    expect(result.patch.saleStartedAt).toBe(NOW)
    expect(result.patch.discountPercent).toBe(50)
    expect(result.patch.baselinePending).toBe(false)
  })

  it('emits release when coming_soon flips to released', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({ releaseStatus: 'coming_soon', availability: 'available' }),
      next: app(),
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['release'])
  })

  it('emits sale_start when discount crosses the threshold', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state(),
      next: discountApp(30),
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['sale_start'])
    expect(result.events[0]?.dedupeKey).toBe(`sale_start:1:${NOW}`)
    expect(result.patch.saleStartedAt).toBe(NOW)
  })

  it('does not emit sale_start below the threshold', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state(),
      next: discountApp(10),
      unavailableConfirmed: false,
    })
    expect(result.events).toEqual([])
    expect(result.patch.saleStartedAt).toBe(NOW)
  })

  it('emits sale_change when the discount changes within a sale', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW + 1000,
      threshold: 20,
      prev: state({ discountPercent: 30, priceFinalRaw: 20860, saleStartedAt: NOW }),
      next: discountApp(40),
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['sale_change'])
    expect(result.patch.saleStartedAt).toBe(NOW)
  })

  it('emits sale_change when crossing the threshold mid-sale', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW + 1000,
      threshold: 50,
      prev: state({ discountPercent: 30, priceFinalRaw: 20860, saleStartedAt: NOW }),
      next: discountApp(60),
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['sale_change'])
  })

  it('emits sale_end only for a tracked qualifying sale', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW + 1000,
      threshold: 20,
      prev: state({ discountPercent: 30, priceFinalRaw: 20860, saleStartedAt: NOW }),
      next: app(),
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['sale_end'])
    expect(result.patch.saleStartedAt).toBeNull()
  })

  it('does not emit sale_end for a below-threshold sale', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW + 1000,
      threshold: 50,
      prev: state({ discountPercent: 30, priceFinalRaw: 20860, saleStartedAt: NOW }),
      next: app(),
      unavailableConfirmed: false,
    })
    expect(result.events).toEqual([])
  })

  it('emits price_change when the base price changes outside a sale', () => {
    const next = app({
      price: {
        currency: 'CNY',
        initialRaw: 26800,
        finalRaw: 26800,
        discountPercent: 0,
        initialFormatted: 'CNY 268.00',
        finalFormatted: '¥ 268.00',
      },
    })
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state(),
      next,
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['price_change'])
  })

  it('marks the first failed check without an event', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state(),
      next: null,
      unavailableConfirmed: false,
    })
    expect(result.events).toEqual([])
    expect(result.patch.availability).toBe('unavailable')
    expect(result.patch.unavailableSince).toBe(NOW)
    expect(result.patch.consecutiveUnavailable).toBe(1)
  })

  it('emits delisted on the second consecutive failure when previously available', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({ availability: 'unavailable', unavailableSince: NOW - 600_000, consecutiveUnavailable: 1 }),
      next: null,
      unavailableConfirmed: true,
    })
    expect(result.events.map((e) => e.type)).toEqual(['delisted'])
    expect(result.patch.delistedNotifiedAt).toBe(NOW)
  })

  it('does not emit delisted when the item was never available', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({
        availability: 'unavailable',
        everAvailable: false,
        unavailableSince: NOW - 600_000,
        consecutiveUnavailable: 1,
      }),
      next: null,
      unavailableConfirmed: true,
    })
    expect(result.events).toEqual([])
  })

  it('emits restored when an unavailable item becomes available again', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({
        availability: 'unavailable',
        unavailableSince: NOW - 3_600_000,
        consecutiveUnavailable: 2,
        delistedNotifiedAt: NOW - 3_000_000,
      }),
      next: app(),
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['restored'])
    expect(result.patch.delistedNotifiedAt).toBeNull()
    expect(result.patch.unavailableSince).toBeNull()
  })

  it('keeps a delisting warning during routine available checks', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({ delistingWarningAt: NOW - 60_000 }),
      next: app(),
      unavailableConfirmed: false,
    })
    expect(result.patch.delistingWarningAt).toBe(NOW - 60_000)
  })

  it('clears the delisting warning when an unavailable item is restored', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({
        availability: 'unavailable',
        unavailableSince: NOW - 3_600_000,
        consecutiveUnavailable: 2,
        delistingWarningAt: NOW - 7_200_000,
      }),
      next: app(),
      unavailableConfirmed: false,
    })
    expect(result.patch.delistingWarningAt).toBeNull()
  })

  it('treats the first ever successful check as restored for forced adds', () => {
    const result = deriveMonitorUpdate({
      monitorId: 1,
      now: NOW,
      threshold: 20,
      prev: state({
        availability: 'unknown',
        everAvailable: false,
        currency: null,
        priceInitialRaw: null,
        priceFinalRaw: null,
        priceInitialFormatted: null,
        priceFinalFormatted: null,
      }),
      next: app(),
      unavailableConfirmed: false,
    })
    expect(result.events.map((e) => e.type)).toEqual(['restored'])
  })
})

describe('computeNextCheckAt', () => {
  const base = {
    consecutiveFailures: 0,
    availability: 'available',
    consecutiveUnavailable: 0,
    releaseStatus: 'released',
    discountPercent: 0,
  }

  it('uses the user poll interval within limits', () => {
    const next = computeNextCheckAt(base, 3600, NOW, () => 0.5)
    expect(next).toBe(NOW + 3600_000)
  })

  it('rechecks unavailable items after 10 minutes on the first failure', () => {
    const next = computeNextCheckAt(
      { ...base, availability: 'unavailable', consecutiveUnavailable: 1 },
      3600,
      NOW,
      () => 0.5,
    )
    expect(next).toBe(NOW + EARLY_RECHECK_MS)
  })

  it('backs off exponentially with failures', () => {
    const next = computeNextCheckAt(
      { ...base, consecutiveFailures: 3 },
      3600,
      NOW,
      () => 0.5,
    )
    expect(next - NOW).toBe(240_000)
  })

  it('caps failure backoff at six hours', () => {
    const next = computeNextCheckAt(
      { ...base, consecutiveFailures: 40 },
      3600,
      NOW,
      () => 0.5,
    )
    expect(next - NOW).toBeLessThanOrEqual(MAX_BACKOFF_MS * 1.2)
  })

  it('polls coming soon and sale items more aggressively', () => {
    expect(
      computeNextCheckAt({ ...base, releaseStatus: 'coming_soon' }, 3600, NOW, () => 0.5) - NOW,
    ).toBe(COMING_SOON_INTERVAL_MS)
    expect(
      computeNextCheckAt({ ...base, discountPercent: 30 }, 3600, NOW, () => 0.5) - NOW,
    ).toBe(SALE_INTERVAL_MS)
  })

  it('keeps news interval at six hours', () => {
    expect(NEWS_INTERVAL_MS).toBe(6 * 60 * 60_000)
  })
})
