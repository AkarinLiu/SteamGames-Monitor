import { EVENT_META } from '../../shared/constants'
import type {
  Availability,
  EventPayload,
  EventSeverity,
  EventType,
  ReleaseStatus,
} from '../../shared/types'
import type { MonitorPatch } from '../db/repo/monitors'
import type { MonitorRow } from '../db/rows'
import type { NormalizedApp } from '../steam/types'

export interface MonitorState {
  baselinePending: boolean
  availability: Availability
  everAvailable: boolean
  releaseStatus: ReleaseStatus
  releaseDateText: string | null
  currency: string | null
  priceInitialRaw: number | null
  priceFinalRaw: number | null
  priceInitialFormatted: string | null
  priceFinalFormatted: string | null
  discountPercent: number
  isFree: boolean
  saleStartedAt: number | null
  unavailableSince: number | null
  delistedNotifiedAt: number | null
  consecutiveUnavailable: number
}

export interface DerivedEvent {
  type: EventType
  severity: EventSeverity
  payload: EventPayload
  dedupeKey: string
}

export interface DeriveResult {
  patch: MonitorPatch
  events: DerivedEvent[]
}

export interface DeriveInput {
  monitorId: number
  now: number
  threshold: number
  prev: MonitorState
  next: NormalizedApp | null
  /** true when this is at least the second consecutive failed availability check */
  unavailableConfirmed: boolean
}

export function monitorRowToState(row: MonitorRow): MonitorState {
  return {
    baselinePending: Number(row.baseline_pending) === 1,
    availability: row.availability as Availability,
    everAvailable: Number(row.ever_available) === 1,
    releaseStatus: row.release_status as ReleaseStatus,
    releaseDateText: row.release_date_text,
    currency: row.currency,
    priceInitialRaw: row.price_initial_raw,
    priceFinalRaw: row.price_final_raw,
    priceInitialFormatted: row.price_initial_formatted,
    priceFinalFormatted: row.price_final_formatted,
    discountPercent: Number(row.discount_percent),
    isFree: Number(row.is_free) === 1,
    saleStartedAt: row.sale_started_at,
    unavailableSince: row.unavailable_since,
    delistedNotifiedAt: row.delisted_notified_at,
    consecutiveUnavailable: Number(row.consecutive_unavailable),
  }
}

function event(type: EventType, payload: EventPayload, dedupeKey: string): DerivedEvent {
  return { type, severity: EVENT_META[type].severity, payload, dedupeKey }
}

function unavailablePatch(
  prev: MonitorState,
  now: number,
  confirmed: boolean,
  monitorId: number,
): DeriveResult {
  const firstFailure = prev.availability !== 'unavailable'
  const unavailableSince = firstFailure ? now : (prev.unavailableSince ?? now)
  const consecutiveUnavailable = prev.consecutiveUnavailable + 1
  const events: DerivedEvent[] = []
  let delistedNotifiedAt = prev.delistedNotifiedAt

  const shouldNotifyDelisted =
    !prev.baselinePending &&
    prev.everAvailable &&
    confirmed &&
    !prev.delistedNotifiedAt

  if (shouldNotifyDelisted) {
    delistedNotifiedAt = now
    events.push(
      event(
        'delisted',
        {
          unavailableSince,
          consecutiveUnavailable,
          previousPriceFinalFormatted: prev.priceFinalFormatted,
          previousDiscountPercent: prev.discountPercent,
        },
        `delisted:${monitorId}:${unavailableSince}`,
      ),
    )
  }

  return {
    patch: {
      availability: 'unavailable',
      unavailableSince,
      consecutiveUnavailable,
      delistedNotifiedAt,
      baselinePending: false,
      saleStartedAt: null,
    },
    events,
  }
}

export function deriveMonitorUpdate(input: DeriveInput): DeriveResult {
  const { monitorId, now, threshold, prev, next, unavailableConfirmed } = input

  if (!next) {
    return unavailablePatch(prev, now, unavailableConfirmed, monitorId)
  }

  const discountPercent = next.price?.discountPercent ?? 0
  const currency = next.price?.currency ?? null
  const priceInitialRaw = next.price?.initialRaw ?? null
  const priceFinalRaw = next.price?.finalRaw ?? null
  const priceInitialFormatted = next.price?.initialFormatted ?? null
  const priceFinalFormatted = next.price?.finalFormatted ?? null
  const releaseStatus: ReleaseStatus = next.release.comingSoon ? 'coming_soon' : 'released'
  const saleStartedAt =
    discountPercent > 0
      ? prev.discountPercent > 0 && prev.saleStartedAt
        ? prev.saleStartedAt
        : now
      : null

  const wasUnavailable = prev.availability === 'unavailable'
  const firstAvailable = !prev.everAvailable
  const events: DerivedEvent[] = []

  if (!prev.baselinePending) {
    if (prev.releaseStatus === 'coming_soon' && releaseStatus === 'released') {
      events.push(
        event(
          'release',
          {
            releaseDateText: next.release.dateText ?? prev.releaseDateText,
            previousStatus: prev.releaseStatus,
          },
          `release:${monitorId}:${now}`,
        ),
      )
    }

    if (wasUnavailable) {
      events.push(
        event(
          'restored',
          {
            firstAvailable,
            unavailableSince: prev.unavailableSince,
            priceFinalFormatted,
            discountPercent,
          },
          `restored:${monitorId}:${prev.unavailableSince ?? now}`,
        ),
      )
    } else if (firstAvailable && prev.availability === 'unknown') {
      events.push(
        event(
          'restored',
          {
            firstAvailable: true,
            unavailableSince: null,
            priceFinalFormatted,
            discountPercent,
          },
          `restored:${monitorId}:first:${now}`,
        ),
      )
    }

    const qualifies = discountPercent >= threshold
    const prevQualifies = prev.discountPercent >= threshold
    const effectiveSaleStart = saleStartedAt ?? now

    if (discountPercent > 0 && prev.discountPercent === 0 && qualifies) {
      events.push(
        event(
          'sale_start',
          {
            discountPercent,
            currency,
            priceInitialRaw,
            priceFinalRaw,
            priceInitialFormatted,
            priceFinalFormatted,
            threshold,
            saleStartedAt: effectiveSaleStart,
          },
          `sale_start:${monitorId}:${effectiveSaleStart}`,
        ),
      )
    } else if (
      discountPercent > 0 &&
      prev.discountPercent > 0 &&
      (discountPercent !== prev.discountPercent ||
        priceFinalRaw !== prev.priceFinalRaw ||
        priceFinalFormatted !== prev.priceFinalFormatted) &&
      (qualifies || prevQualifies)
    ) {
      events.push(
        event(
          'sale_change',
          {
            oldDiscountPercent: prev.discountPercent,
            discountPercent,
            oldPriceFinalRaw: prev.priceFinalRaw,
            priceFinalRaw,
            oldPriceFinalFormatted: prev.priceFinalFormatted,
            priceFinalFormatted,
            currency,
            saleStartedAt: effectiveSaleStart,
          },
          `sale_change:${monitorId}:${effectiveSaleStart}:${prev.discountPercent}->${discountPercent}:${prev.priceFinalRaw}->${priceFinalRaw}`,
        ),
      )
    } else if (
      discountPercent === 0 &&
      prev.discountPercent > 0 &&
      prev.saleStartedAt &&
      prevQualifies
    ) {
      events.push(
        event(
          'sale_end',
          {
            oldDiscountPercent: prev.discountPercent,
            oldPriceFinalFormatted: prev.priceFinalFormatted,
            priceInitialFormatted,
            saleStartedAt: prev.saleStartedAt,
          },
          `sale_end:${monitorId}:${prev.saleStartedAt}`,
        ),
      )
    }

    const priceChanged =
      !wasUnavailable &&
      discountPercent === 0 &&
      prev.discountPercent === 0 &&
      (prev.isFree !== next.isFree || prev.priceInitialRaw !== priceInitialRaw) &&
      (prev.priceInitialRaw !== null || prev.isFree)
    if (priceChanged) {
      events.push(
        event(
          'price_change',
          {
            oldPriceInitialRaw: prev.priceInitialRaw,
            priceInitialRaw,
            oldPriceInitialFormatted: prev.priceInitialFormatted,
            priceInitialFormatted,
            oldIsFree: prev.isFree,
            isFree: next.isFree,
            currency,
          },
          `price_change:${monitorId}:${prev.priceInitialRaw}->${priceInitialRaw}:${prev.isFree}->${next.isFree}`,
        ),
      )
    }
  }

  return {
    patch: {
      baselinePending: false,
      availability: 'available',
      everAvailable: true,
      releaseStatus,
      releaseDateText: next.release.dateText,
      currency,
      priceInitialRaw,
      priceFinalRaw,
      priceInitialFormatted,
      priceFinalFormatted,
      discountPercent,
      isFree: next.isFree,
      saleStartedAt,
      unavailableSince: null,
      delistedNotifiedAt: null,
      consecutiveUnavailable: 0,
    },
    events,
  }
}
