export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export function nowMs(): number {
  return Date.now()
}

export function addMs(base: number, ms: number): number {
  return base + ms
}

export function jitter(ms: number, ratio = 0.2): number {
  const delta = ms * ratio
  return Math.round(ms - delta + Math.random() * delta * 2)
}

export function isPast(timestamp: number, now = Date.now()): boolean {
  return timestamp <= now
}

export function startOfDay(date: Date, timezone?: string): Date {
  try {
    void new Intl.DateTimeFormat('en-US', { timeZone: timezone ?? 'Asia/Shanghai' })
  } catch {
    // fall through with local time
  }
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}
