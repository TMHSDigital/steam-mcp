export class SteamApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
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
