export class SteamApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    /** Request URL without its query string. */
    public readonly endpoint?: string,
    /** Steam's X-eresult header, when present. */
    public readonly eresult?: number,
    /** Steam's X-error_message header, when present. */
    public readonly steamMessage?: string,
  ) {
    super(message);
    this.name = "SteamApiError";
  }
}

export class MissingApiKeyError extends SteamApiError {
  constructor() {
    super(
      "STEAM_API_KEY environment variable is not set. " +
        "Get a free key at https://steamcommunity.com/dev/apikey",
    );
    this.name = "MissingApiKeyError";
  }
}

export class InvalidApiKeyError extends SteamApiError {
  constructor(endpoint?: string) {
    super(
      "Steam rejected STEAM_API_KEY (HTTP 403: verify your key). Check the key is correct and active at https://steamcommunity.com/dev/apikey",
      403,
      endpoint,
    );
    this.name = "InvalidApiKeyError";
  }
}

export class RateLimitError extends SteamApiError {
  constructor() {
    super("Steam API rate limit reached. Please wait before retrying.");
    this.name = "RateLimitError";
  }
}

export class SteamUnavailableError extends SteamApiError {
  constructor() {
    super("Steam API is currently unavailable. Try again later.");
    this.name = "SteamUnavailableError";
  }
}

export class TimeoutError extends SteamApiError {
  constructor(public readonly timeoutMs: number = 15_000) {
    super(
      `Steam API request timed out after ${(timeoutMs / 1000).toFixed(0)}s. The server may be slow or unreachable.`,
    );
    this.name = "TimeoutError";
  }
}
