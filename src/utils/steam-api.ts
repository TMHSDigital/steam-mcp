import {
  SteamApiError,
  MissingApiKeyError,
  RateLimitError,
  SteamUnavailableError,
  TimeoutError,
} from "./errors.js";

const DEFAULT_TIMEOUT_MS = 15_000;

const STEAM_API_BASE = "https://api.steampowered.com";
const STEAM_STORE_BASE = "https://store.steampowered.com";
const STEAM_PARTNER_BASE = "https://partner.steam-api.com";

export function getApiKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    throw new MissingApiKeyError();
  }
  return key;
}

export function requireApiKey(): string {
  return getApiKey();
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

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function steamFetch(
  url: string,
  options: RequestInit = {},
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
          : BASE_RETRY_DELAY_MS * 2 ** attempt;

        if (attempt < MAX_RETRIES) {
          await sleep(delayMs);
          continue;
        }
        throw new RateLimitError();
      }

      if (response.status >= 500) {
        throw new SteamUnavailableError();
      }

      if (!response.ok) {
        throw new SteamApiError(
          `Steam API returned HTTP ${response.status}`,
          response.status,
          url,
        );
      }

      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new SteamApiError("Unexpected response from Steam API.");
      }
    } catch (error) {
      if (error instanceof SteamApiError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TimeoutError(DEFAULT_TIMEOUT_MS);
      }
      lastError = error;
      throw new SteamApiError(
        `Failed to reach Steam API: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ??
    new SteamApiError("Steam API request failed after retries.")
  );
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
