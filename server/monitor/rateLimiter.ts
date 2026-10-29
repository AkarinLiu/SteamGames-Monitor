export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity
    this.lastRefill = now()
  }

  private refill(): void {
    const now = this.now()
    if (now <= this.lastRefill) return
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.lastRefill) * this.refillPerMs)
    this.lastRefill = now
  }

  tryTake(amount = 1): boolean {
    this.refill()
    if (this.tokens + 1e-9 < amount) return false
    this.tokens -= amount
    return true
  }

  waitMs(amount = 1): number {
    this.refill()
    if (this.tokens + 1e-9 >= amount) return 0
    return Math.ceil((amount - this.tokens) / this.refillPerMs)
  }

  get available(): number {
    this.refill()
    return Math.max(0, Math.floor(this.tokens * 1000) / 1000)
  }
}

export interface LimiterSnapshot {
  capacity: number
  tokens: number
  cooldownUntil: number | null
}

export interface AcquireResult {
  ok: boolean
  waitMs: number
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

export class SteamRateLimiter {
  private readonly bucket: TokenBucket
  private cooldownUntil: number | null = null

  constructor(
    capacity = 24,
    windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {
    this.bucket = new TokenBucket(capacity, capacity / windowMs, now)
  }

  setCooldown(ms: number): void {
    const until = this.now() + Math.max(0, ms)
    if (this.cooldownUntil === null || until > this.cooldownUntil) {
      this.cooldownUntil = until
    }
  }

  getCooldownMs(): number {
    if (this.cooldownUntil === null) return 0
    const remaining = this.cooldownUntil - this.now()
    if (remaining <= 0) {
      this.cooldownUntil = null
      return 0
    }
    return remaining
  }

  tryAcquire(): AcquireResult {
    const cooldown = this.getCooldownMs()
    if (cooldown > 0) return { ok: false, waitMs: cooldown }
    if (this.bucket.tryTake()) return { ok: true, waitMs: 0 }
    return { ok: false, waitMs: this.bucket.waitMs() }
  }

  async acquire(maxWaitMs: number, signal?: AbortSignal): Promise<boolean> {
    const deadline = this.now() + Math.max(0, maxWaitMs)
    for (;;) {
      const result = this.tryAcquire()
      if (result.ok) return true
      const remaining = deadline - this.now()
      if (remaining <= 0) return false
      await sleep(Math.min(result.waitMs, remaining, 1000), signal)
    }
  }

  snapshot(): LimiterSnapshot {
    return {
      capacity: 24,
      tokens: this.bucket.available,
      cooldownUntil: this.cooldownUntil,
    }
  }
}
