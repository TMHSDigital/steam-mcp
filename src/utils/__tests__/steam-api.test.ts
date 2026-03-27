import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  steamFetch,
  steamApiUrl,
  steamStoreUrl,
  steamPartnerUrl,
  errorResponse,
  getApiKey,
} from "../steam-api.js";
import {
  SteamApiError,
  MissingApiKeyError,
  RateLimitError,
  SteamUnavailableError,
  TimeoutError,
} from "../errors.js";

describe("URL builders", () => {
  it("steamApiUrl builds correct URL with params", () => {
    const url = steamApiUrl("/ISteamUser/GetPlayerSummaries/v2/", {
      key: "abc",
      steamids: "123",
    });
    expect(url).toContain("api.steampowered.com");
    expect(url).toContain("key=abc");
    expect(url).toContain("steamids=123");
  });

  it("steamStoreUrl builds store URLs", () => {
    const url = steamStoreUrl("/api/appdetails", { appids: 440 });
    expect(url).toContain("store.steampowered.com");
    expect(url).toContain("appids=440");
  });

  it("steamPartnerUrl builds partner URLs", () => {
    const url = steamPartnerUrl("/ISteamLeaderboards/GetLeaderboardEntries/v1/", {
      appid: 440,
    });
    expect(url).toContain("partner.steam-api.com");
    expect(url).toContain("appid=440");
  });

  it("omits undefined params", () => {
    const url = steamApiUrl("/test", { a: "1", b: undefined, c: "3" });
    expect(url).toContain("a=1");
    expect(url).toContain("c=3");
    expect(url).not.toContain("b=");
  });
});

describe("getApiKey", () => {
  const originalKey = process.env.STEAM_API_KEY;

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.STEAM_API_KEY = originalKey;
    } else {
      delete process.env.STEAM_API_KEY;
    }
  });

  it("returns key when set", () => {
    process.env.STEAM_API_KEY = "TESTKEY123";
    expect(getApiKey()).toBe("TESTKEY123");
  });

  it("throws MissingApiKeyError when not set", () => {
    delete process.env.STEAM_API_KEY;
    expect(() => getApiKey()).toThrow(MissingApiKeyError);
  });
});

describe("errorResponse", () => {
  it("formats Error instances", () => {
    const result = errorResponse(new Error("test error"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("test error");
  });

  it("formats non-Error values", () => {
    const result = errorResponse("string error");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("An unknown error occurred.");
  });

  it("formats SteamApiError subclasses", () => {
    const result = errorResponse(new RateLimitError());
    expect(result.content[0].text).toContain("rate limit");
  });
});

describe("steamFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    const mockData = { response: { player_count: 42 } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
        headers: new Headers(),
      }),
    );

    const result = await steamFetch("https://api.steampowered.com/test");
    expect(result).toEqual(mockData);
  });

  it("throws SteamUnavailableError on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
      }),
    );

    await expect(
      steamFetch("https://api.steampowered.com/test"),
    ).rejects.toThrow(SteamUnavailableError);
  });

  it("throws SteamApiError on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
      }),
    );

    await expect(
      steamFetch("https://api.steampowered.com/test"),
    ).rejects.toThrow(SteamApiError);
  });

  it("throws SteamApiError on invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("not json"),
        headers: new Headers(),
      }),
    );

    await expect(
      steamFetch("https://api.steampowered.com/test"),
    ).rejects.toThrow("Unexpected response");
  });

  it("retries on 429 then succeeds", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"ok": true}'),
        headers: new Headers(),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await steamFetch("https://api.steampowered.com/test");
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws RateLimitError after exhausting retries on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
      }),
    );

    await expect(
      steamFetch("https://api.steampowered.com/test"),
    ).rejects.toThrow(RateLimitError);
  });

  it("throws TimeoutError on abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        new DOMException("aborted", "AbortError"),
      ),
    );

    await expect(
      steamFetch("https://api.steampowered.com/test"),
    ).rejects.toThrow(TimeoutError);
  });

  it("throws SteamApiError on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(
      steamFetch("https://api.steampowered.com/test"),
    ).rejects.toThrow("Failed to reach Steam API");
  });
});
