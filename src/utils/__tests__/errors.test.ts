import { describe, it, expect } from "vitest";
import {
  SteamApiError,
  MissingApiKeyError,
  RateLimitError,
  SteamUnavailableError,
  TimeoutError,
} from "../errors.js";

describe("SteamApiError", () => {
  it("stores message, statusCode, and endpoint", () => {
    const err = new SteamApiError("bad request", 400, "/foo");
    expect(err.message).toBe("bad request");
    expect(err.statusCode).toBe(400);
    expect(err.endpoint).toBe("/foo");
    expect(err.name).toBe("SteamApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("works without optional fields", () => {
    const err = new SteamApiError("oops");
    expect(err.statusCode).toBeUndefined();
    expect(err.endpoint).toBeUndefined();
  });
});

describe("MissingApiKeyError", () => {
  it("extends SteamApiError with setup instructions", () => {
    const err = new MissingApiKeyError();
    expect(err).toBeInstanceOf(SteamApiError);
    expect(err.name).toBe("MissingApiKeyError");
    expect(err.message).toContain("STEAM_API_KEY");
    expect(err.message).toContain("steamcommunity.com/dev/apikey");
  });
});

describe("RateLimitError", () => {
  it("extends SteamApiError", () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(SteamApiError);
    expect(err.name).toBe("RateLimitError");
    expect(err.message).toContain("rate limit");
  });
});

describe("SteamUnavailableError", () => {
  it("extends SteamApiError", () => {
    const err = new SteamUnavailableError();
    expect(err).toBeInstanceOf(SteamApiError);
    expect(err.name).toBe("SteamUnavailableError");
    expect(err.message).toContain("unavailable");
  });
});

describe("TimeoutError", () => {
  it("extends SteamApiError with default timeout", () => {
    const err = new TimeoutError();
    expect(err).toBeInstanceOf(SteamApiError);
    expect(err.name).toBe("TimeoutError");
    expect(err.timeoutMs).toBe(15_000);
    expect(err.message).toContain("15s");
  });

  it("accepts custom timeout value", () => {
    const err = new TimeoutError(5_000);
    expect(err.timeoutMs).toBe(5_000);
    expect(err.message).toContain("5s");
  });
});
