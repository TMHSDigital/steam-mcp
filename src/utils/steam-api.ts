import {
  SteamApiError,
  MissingApiKeyError,
  InvalidApiKeyError,
  RateLimitError,
  SteamUnavailableError,
  TimeoutError,
} from "./errors.js";
import { debug, describeUrl } from "./log.js";
import { acquireToken, cacheGet, cacheKey, cacheSet, cacheTtlSeconds } from "./cache.js";

const DEFAULT_TIMEOUT_MS = 15_000;

const STEAM_API_BASE = "https://api.steampowered.com";
const STEAM_STORE_BASE = "https://store.steampowered.com";
const STEAM_PARTNER_BASE = "https://partner.steam-api.com";

export function requireApiKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    throw new MissingApiKeyError();
  }
  return key;
}

function buildUrl(
  base: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Web API array parameters are sent as name[0], name[1], ... */
export function indexedParams(name: string, values: readonly (string | number)[] | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  values?.forEach((v, i) => {
    out[`${name}[${i}]`] = v;
  });
  return out;
}

export function steamApiUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): string {
  return buildUrl(STEAM_API_BASE, path, params);
}

export function steamStoreUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): string {
  return buildUrl(STEAM_STORE_BASE, path, params);
}

export function steamPartnerUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): string {
  return buildUrl(STEAM_PARTNER_BASE, path, params);
}

export async function steamPartnerPost(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<unknown> {
  const url = new URL(path, STEAM_PARTNER_BASE).toString();
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      body.set(key, String(value));
    }
  }
  return steamFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1_000;

const MAX_RETRY_DELAY_MS = 10_000;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with up to 25% jitter, so concurrent callers spread out. */
function backoffMs(attempt: number): number {
  const base = BASE_RETRY_DELAY_MS * 2 ** attempt;
  return Math.min(base + Math.random() * base * 0.25, MAX_RETRY_DELAY_MS);
}

/** Retry-After is either delta-seconds or an HTTP-date. Falls back to backoff when unparseable. */
export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const trimmed = retryAfter.trim();
    const ms = /^\d+$/.test(trimmed)
      ? Number(trimmed) * 1000
      : Date.parse(trimmed) - Date.now();
    if (Number.isFinite(ms)) {
      return Math.min(Math.max(ms, 0), MAX_RETRY_DELAY_MS);
    }
  }
  return backoffMs(attempt);
}

/** A JSON `error` string at the top level or one level down, e.g. `{ playerstats: { error } }`. */
function bodyErrorMessage(body: string): string | undefined {
  try {
    const data = JSON.parse(body) as Record<string, unknown>;
    for (const value of [data, ...Object.values(data)]) {
      const message = (value as { error?: unknown } | null)?.error;
      if (typeof message === "string" && message) return message;
    }
  } catch {
    // Not JSON.
  }
  return undefined;
}

/** Steam's own failure detail: X-eresult / X-error_message headers, else a JSON body `error`. */
function steamErrorDetail(
  headers: Headers,
  body: string,
): { eresult?: number; steamMessage?: string } {
  const raw = headers.get("x-eresult");
  const eresult = raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
  const steamMessage = headers.get("x-error_message") ?? bodyErrorMessage(body);
  return { eresult, steamMessage };
}

function describeNonJson(text: string, contentType: string | null): string {
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 100);
  const looksHtml = /html/i.test(contentType ?? "") || snippet.startsWith("<");
  return (
    `Unexpected non-JSON response from Steam API (content-type: ${contentType ?? "unknown"}; starts with: ${JSON.stringify(snippet)}).` +
    (looksHtml ? " Received HTML: the endpoint may be retired or require login." : "")
  );
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/** URL without its query string, so error objects never carry the API key. */
function endpointOf(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url.split("?")[0];
  }
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Fetch and parse a Steam JSON response. Public GETs listed in cache.ts are
 * cached briefly and identical concurrent GETs share one request. Every
 * request waits for a per-host rate-limit token, so bursts queue instead of
 * tripping Steam's 429.
 */
export async function steamFetch(
  url: string,
  options: RequestInit = {},
): Promise<unknown> {
  const method = (options.method ?? "GET").toUpperCase();
  const ttl = method === "GET" ? cacheTtlSeconds(url) : 0;
  if (ttl === 0) {
    return fetchWithRetry(url, options);
  }

  const key = cacheKey(url);
  const cached = cacheGet(key);
  if (cached.hit) {
    debug(`${method} ${describeUrl(url)} -> cache hit`);
    return cached.value;
  }
  const pending = inFlight.get(key);
  if (pending) {
    return structuredClone(await pending);
  }

  const request = fetchWithRetry(url, options).then((value) => {
    cacheSet(key, value, ttl);
    return value;
  });
  inFlight.set(key, request);
  try {
    return structuredClone(await request);
  } finally {
    inFlight.delete(key);
  }
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<unknown> {
  const method = options.method ?? "GET";
  const target = describeUrl(url);
  const host = new URL(url).host;

  for (let attempt = 0; ; attempt++) {
    const queued = await acquireToken(host);
    if (queued > 0) {
      debug(`${method} ${target} queued ${queued}ms by the ${host} rate limiter`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const started = Date.now();
    let response: Response;
    let text: string;

    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      text = await readBody(response);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        debug(`${method} ${target} -> timeout after ${DEFAULT_TIMEOUT_MS}ms (attempt ${attempt + 1})`);
        throw new TimeoutError(DEFAULT_TIMEOUT_MS);
      }
      const reason = error instanceof Error ? error.message : String(error);
      debug(`${method} ${target} -> network error: ${reason} (attempt ${attempt + 1})`);
      throw new SteamApiError(`Failed to reach Steam API: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }

    debug(
      `${method} ${target} -> ${response.status} in ${Date.now() - started}ms (attempt ${attempt + 1}${
        response.headers.get("x-eresult") ? `, eresult ${response.headers.get("x-eresult")}` : ""
      })`,
    );

    const canRetry = attempt < MAX_RETRIES;

    if (response.status === 429) {
      if (canRetry) {
        const wait = retryDelayMs(response.headers.get("Retry-After"), attempt);
        debug(`${method} ${target} rate limited, retrying in ${Math.round(wait)}ms`);
        await sleep(wait);
        continue;
      }
      throw new RateLimitError();
    }

    if (TRANSIENT_STATUSES.has(response.status) && canRetry) {
      const wait = backoffMs(attempt);
      debug(`${method} ${target} transient ${response.status}, retrying in ${Math.round(wait)}ms`);
      await sleep(wait);
      continue;
    }

    if (response.status >= 500) {
      throw new SteamUnavailableError();
    }

    if (!response.ok) {
      // Steam answers a bad key with a 403 HTML page asking to verify key=.
      if (response.status === 403 && /verify your\s*(<[^>]+>\s*)*key=/i.test(text)) {
        throw new InvalidApiKeyError(endpointOf(url));
      }
      const { eresult, steamMessage } = steamErrorDetail(response.headers, text);
      const detail = [
        eresult !== undefined ? `EResult ${eresult}` : undefined,
        steamMessage,
      ]
        .filter(Boolean)
        .join(": ");
      throw new SteamApiError(
        `Steam API returned HTTP ${response.status}${detail ? ` (${detail})` : ""}`,
        response.status,
        endpointOf(url),
        eresult,
        steamMessage,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new SteamApiError(
        describeNonJson(text, response.headers.get("content-type")),
        response.status,
        endpointOf(url),
      );
    }
  }
}

/**
 * EResult from a Partner write response shaped `{ result: { result: n } }`,
 * or undefined when Steam did not return one.
 */
export function eresultOf(data: unknown): number | undefined {
  const result = (data as { result?: { result?: unknown } } | null)?.result;
  return typeof result?.result === "number" ? result.result : undefined;
}

/** " Steam says: EResult n: message." when Steam sent failure headers, else "". */
export function steamDetailSuffix(error: SteamApiError): string {
  const parts = [
    error.eresult !== undefined ? `EResult ${error.eresult}` : undefined,
    error.steamMessage,
  ].filter(Boolean);
  return parts.length ? ` Steam says: ${parts.join(": ")}.` : "";
}

/**
 * errorResponse() for Partner API calls. 401/403 means the key is not a
 * publisher key or the server IP is not allowlisted. 400 means Steam rejected
 * the parameters, which is not a key problem.
 */
export function publisherErrorResponse(error: unknown): ReturnType<typeof errorResponse> {
  if (error instanceof SteamApiError && (error.statusCode === 401 || error.statusCode === 403)) {
    return errorResponse(
      new Error(
        `HTTP ${error.statusCode} - This tool requires a Steam Publisher API key with the server's IP allowlisted in your Steamworks partner settings. Set STEAM_API_KEY to a publisher key and add the server IP to your Web API key's allowed IP list at https://partner.steamgames.com/doc/webapi_overview/auth.${steamDetailSuffix(error)}`,
      ),
    );
  }
  if (error instanceof SteamApiError && error.statusCode === 400) {
    return errorResponse(
      new Error(
        `HTTP 400 - Steam rejected the request. Check the appid, Steam ID, and any achievement, leaderboard, item, or file IDs.${steamDetailSuffix(error)}`,
      ),
    );
  }
  return errorResponse(error);
}

export function errorResponse(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
