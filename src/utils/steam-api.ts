import {
  SteamApiError,
  MissingApiKeyError,
  RateLimitError,
  SteamUnavailableError,
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

export async function steamFetch(
  url: string,
  options: RequestInit = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (response.status === 429) {
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
      throw new SteamUnavailableError();
    }
    throw new SteamApiError(
      `Failed to reach Steam API: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
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
