// Short-TTL response cache and per-host token buckets for steamFetch.
// Agents repeat the same lookups within a conversation, and the Store
// appdetails endpoint allows only about 200 requests per 5 minutes per IP.

/** [pattern on host+path, TTL seconds]. First match wins; no match is not cached. */
const TTL_RULES: Array<[RegExp, number]> = [
  [/^store\.steampowered\.com\/api\/(appdetails|storesearch)/, 600],
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

/** [burst, refill per second] per host. Requests queue instead of failing. */
const BUCKETS: Record<string, [number, number]> = {
  "store.steampowered.com": [20, 200 / 300],
  "api.steampowered.com": [20, 5],
  "partner.steam-api.com": [10, 5],
};

const state = new Map<string, { tokens: number; updated: number }>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for a token for `host`. Returns the milliseconds waited. Unknown hosts pass through. */
export async function acquireToken(host: string): Promise<number> {
  const config = BUCKETS[host];
  if (!config) return 0;
  const [burst, perSecond] = config;
  let waited = 0;
  for (;;) {
    const now = Date.now();
    const s = state.get(host) ?? { tokens: burst, updated: now };
    s.tokens = Math.min(burst, s.tokens + ((now - s.updated) / 1000) * perSecond);
    s.updated = now;
    state.set(host, s);
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
