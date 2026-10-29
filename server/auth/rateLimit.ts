export interface RateLimitResult {
  allowed: boolean
  retryAfterMs: number
  remaining: number
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    const entries = this.prune(key, now)
    const remaining = Math.max(0, this.max - entries.length)
    if (entries.length < this.max) {
      return { allowed: true, retryAfterMs: 0, remaining }
    }
    const oldest = entries[0] ?? now
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + this.windowMs - now),
      remaining: 0,
    }
  }

  hit(key: string, now = Date.now()): void {
    const entries = this.prune(key, now)
    entries.push(now)
    this.hits.set(key, entries)
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  purge(now = Date.now()): void {
    for (const key of this.hits.keys()) {
      this.prune(key, now)
    }
  }

  get size(): number {
    return this.hits.size
  }

  private prune(key: string, now: number): number[] {
    const cutoff = now - this.windowMs
    const entries = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff)
    if (entries.length === 0) {
      if (this.hits.has(key)) this.hits.delete(key)
      return []
    }
    this.hits.set(key, entries)
    return entries
  }
}
