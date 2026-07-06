type RateLimitEntry = {
  attempts: number[];
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function prune(entry: RateLimitEntry, now: number) {
  entry.attempts = entry.attempts.filter((attempt) => now - attempt < WINDOW_MS);
}

export function rateLimitAttempt(
  store: Map<string, RateLimitEntry>,
  key: string,
  now = Date.now(),
): boolean {
  const entry = store.get(key) ?? { attempts: [] };
  prune(entry, now);
  if (entry.attempts.length >= MAX_ATTEMPTS) {
    store.set(key, entry);
    return false;
  }
  entry.attempts.push(now);
  store.set(key, entry);
  return true;
}

export function clearRateLimit(store: Map<string, RateLimitEntry>, key: string) {
  store.delete(key);
}

export type RateLimitStore = Map<string, RateLimitEntry>;
