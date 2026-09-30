/** Sliding window per user, in memory (one API process). Returns seconds to wait, or 0 when the request may proceed. */
export function createRateLimiter(max = 20, windowMs = 60_000, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (userId: string): number => {
    const t = now();
    const recent = (hits.get(userId) ?? []).filter((h) => t - h < windowMs);
    if (recent.length >= max) {
      hits.set(userId, recent);
      return Math.max(1, Math.ceil((recent[0]! + windowMs - t) / 1000));
    }
    recent.push(t);
    hits.set(userId, recent);
    return 0;
  };
}
