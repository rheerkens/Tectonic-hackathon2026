const hits = new Map<string, number[]>();

/** True when this user may spend one LLM call now (10 per minute per user). */
// ponytail: in-memory, single API replica (railway.json); resets on restart. Move to Redis/DB if we ever scale out.
export function takeLlmBudget(userId: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
  const ok = recent.length < max;
  if (ok) recent.push(now);
  if (recent.length) hits.set(userId, recent);
  else hits.delete(userId);
  return ok;
}
