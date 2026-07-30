// Pure client-side rate limiting: how long to wait before the next request and
// how long to back off after a 429. No timers and no network here, so the
// policy is unit-testable.

export interface RateLimitConfig {
  /** Minimal gap between two requests (a per-second cap). */
  minIntervalMs: number;
  /** Sliding window length for the per-window cap. */
  windowMs: number;
  /** How many requests may start inside one window. */
  maxInWindow: number;
}

/**
 * Delay before the next request may start, given the timestamps of previous
 * ones (ascending). Enforces both caps: the gap after the last request and the
 * sliding window — when the window is full, wait until its oldest entry ages out.
 */
export function nextDelayMs(
  history: number[],
  now: number,
  cfg: RateLimitConfig,
): number {
  const last = history.length > 0 ? history[history.length - 1] : null;
  const gapWait = last != null ? cfg.minIntervalMs - (now - last) : 0;

  const inWindow = history.filter((t) => now - t < cfg.windowMs);
  let windowWait = 0;
  if (inWindow.length >= cfg.maxInWindow) {
    // the request that has to expire before a new one fits
    const blocking = inWindow[inWindow.length - cfg.maxInWindow];
    windowWait = cfg.windowMs - (now - blocking);
  }

  return Math.max(0, gapWait, windowWait);
}

/** Drop timestamps that no longer affect any decision. */
export function trimHistory(history: number[], now: number, cfg: RateLimitConfig): number[] {
  return history.filter((t) => now - t < cfg.windowMs);
}

/**
 * Wait before retrying a 429: the server's Retry-After wins when it is sane,
 * otherwise the configured schedule. Returns null when the budget is spent.
 */
export function retryDelayMs(
  attempt: number,
  schedule: number[],
  retryAfterHeader?: string | null,
): number | null {
  if (attempt >= schedule.length) return null;
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0 && seconds <= 120) return seconds * 1000;
  return schedule[attempt];
}
