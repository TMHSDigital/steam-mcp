// Short-TTL response cache and token buckets for steamFetch.
// Agents repeat the same lookups within a conversation, and the Store
// appdetails endpoint allows only about 200 requests per 5 minutes per IP.

/** [pattern on host+path, TTL seconds]. First match wins; no match is not cached. */
const TTL_RULES: Array<[RegExp, number]> = [
  [/^store\.steampowered\.com\/api\/(appdetails|storesearch)/, 600],
  // Deck categories change rarely.
  [/^store\.steampowered\.com\/saleaction\/ajaxgetdeckappcompatibilityreport/, 3600],
  [/\/ISteamUserStats\/GetNumberOfCurrentPlayers\//, 30],
  [/\/ISteamUserStats\/(GetSchemaForGame|GetGlobalAchievementPercentagesForApp)\//, 3600],
  [/\/ISteamNews\/GetNewsForApp\//, 600],
  [/\/IUserReviewsService\/GetAppReviews\//, 600],
  [/\/ISteamUser\/ResolveVanityURL\//, 3600],
];

const MAX_ENTRIES = 500;

interface Entry {
  expires: number;
  value: unknown;
}

const cache = new Map<string, Entry>();

/**
 * Seconds to cache a GET of `url`, or 0. STEAM_MCP_CACHE_TTL=0 disables the
 * cache; any other number replaces every per-endpoint TTL.
 */
export function cacheTtlSeconds(url: string): number {
  const override = process.env.STEAM_MCP_CACHE_TTL?.trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 0;
  }
  const target = `${u.host}${u.pathname}`;
  const rule = TTL_RULES.find(([pattern]) => pattern.test(target));
  if (!rule) return 0;
  if (override !== undefined && override !== "") {
    const n = Number(override);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return rule[1];
}

/** Cache key: the URL without its `key` parameter, so keys never sit in memory twice. */
export function cacheKey(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("key");
  u.searchParams.sort();
  return u.toString();
}

export function cacheGet(key: string): { hit: true; value: unknown } | { hit: false } {
  const entry = cache.get(key);
  if (!entry) return { hit: false };
  if (entry.expires <= Date.now()) {
    cache.delete(key);
    return { hit: false };
  }
  // Refresh LRU position.
  cache.delete(key);
  cache.set(key, entry);
  return { hit: true, value: structuredClone(entry.value) };
}

export function cacheSet(key: string, value: unknown, ttlSeconds: number): void {
  cache.delete(key);
  cache.set(key, { expires: Date.now() + ttlSeconds * 1000, value: structuredClone(value) });
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value as string);
  }
}

export function clearCache(): void {
  cache.clear();
}

// --- Rate limiting -------------------------------------------------------

/**
 * [pattern on host+path, bucket name, burst, refill per second]. First match
 * wins; no match is not limited. Requests queue instead of failing.
 * Only appdetails has the documented ~200 per 5 minutes per IP limit, so the
 * rest of the store host gets its own, looser bucket and relies on the 429
 * retry (#112).
 */
const BUCKETS: Array<[RegExp, string, number, number]> = [
  [/^store\.steampowered\.com\/api\/appdetails/, "store appdetails", 20, 200 / 300],
  [/^store\.steampowered\.com(\/|$)/, "store", 20, 2],
  [/^api\.steampowered\.com(\/|$)/, "api.steampowered.com", 20, 5],
  [/^partner\.steam-api\.com(\/|$)/, "partner.steam-api.com", 10, 5],
];

/** The bucket a request to `target` (host + path) draws from, or undefined. */
export function bucketFor(target: string): { name: string; burst: number; perSecond: number } | undefined {
  const rule = BUCKETS.find(([pattern]) => pattern.test(target));
  return rule ? { name: rule[1], burst: rule[2], perSecond: rule[3] } : undefined;
}

const state = new Map<string, { tokens: number; updated: number }>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a token from the bucket for `target` (host + path, no scheme).
 * Returns the milliseconds waited. Unmatched targets pass through.
 */
export async function acquireToken(target: string): Promise<number> {
  const bucket = bucketFor(target);
  if (!bucket) return 0;
  const { name, burst, perSecond } = bucket;
  let waited = 0;
  for (;;) {
    const now = Date.now();
    const s = state.get(name) ?? { tokens: burst, updated: now };
    s.tokens = Math.min(burst, s.tokens + ((now - s.updated) / 1000) * perSecond);
    s.updated = now;
    state.set(name, s);
    if (s.tokens >= 1) {
      s.tokens -= 1;
      return waited;
    }
    const wait = Math.ceil(((1 - s.tokens) / perSecond) * 1000);
    waited += wait;
    await sleep(wait);
  }
}

export function resetRateLimits(): void {
  state.clear();
}
