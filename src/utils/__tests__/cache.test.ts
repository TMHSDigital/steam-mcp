import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { steamFetch } from "../steam-api.js";
import { cacheKey, cacheTtlSeconds, acquireToken } from "../cache.js";

beforeEach(() => {
  vi.stubEnv("STEAM_MCP_CACHE_TTL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body)));

describe("cacheTtlSeconds", () => {
  it("uses per-endpoint TTLs", () => {
    expect(cacheTtlSeconds("https://store.steampowered.com/api/appdetails?appids=440")).toBe(600);
    expect(cacheTtlSeconds("https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=440")).toBe(30);
    expect(cacheTtlSeconds("https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?appid=440")).toBe(3600);
  });

  it("never caches per-user or partner endpoints", () => {
    expect(cacheTtlSeconds("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?steamids=1")).toBe(0);
    expect(cacheTtlSeconds("https://partner.steam-api.com/ISteamLeaderboards/GetLeaderboardsForGame/v2/?appid=1")).toBe(0);
  });

  it("STEAM_MCP_CACHE_TTL=0 disables, a number overrides", () => {
    vi.stubEnv("STEAM_MCP_CACHE_TTL", "0");
    expect(cacheTtlSeconds("https://store.steampowered.com/api/appdetails?appids=440")).toBe(0);
    vi.stubEnv("STEAM_MCP_CACHE_TTL", "5");
    expect(cacheTtlSeconds("https://store.steampowered.com/api/appdetails?appids=440")).toBe(5);
  });
});

describe("steamFetch cache", () => {
  it("serves a repeat GET from cache and keeps the key out of the cache key", async () => {
    const fetchMock = vi.fn(ok({ n: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=SECRET&appid=440";

    const a = (await steamFetch(url)) as { n: number };
    a.n = 99; // callers mutating a result must not corrupt the cache
    const b = await steamFetch(url);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toEqual({ n: 1 });
    expect(cacheKey(url)).not.toContain("SECRET");
  });

  it("expires entries after the TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = vi.fn(ok({ player_count: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=440";

    await steamFetch(url);
    vi.setSystemTime(Date.now() + 31_000);
    await steamFetch(url);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one request between identical concurrent GETs", async () => {
    const fetchMock = vi.fn(ok({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://store.steampowered.com/api/appdetails?appids=620";

    await Promise.all([steamFetch(url), steamFetch(url), steamFetch(url)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never caches POSTs or errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockImplementation(ok({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://store.steampowered.com/api/appdetails?appids=1";

    await expect(steamFetch(url)).rejects.toThrow();
    await steamFetch(url);
    await steamFetch(url, { method: "POST" });
    await steamFetch(url, { method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("acquireToken", () => {
  it("lets a burst through, then queues", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 20; i++) {
      expect(await acquireToken("store.steampowered.com")).toBe(0);
    }
    const pending = acquireToken("store.steampowered.com");
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBeGreaterThan(0);
  });

  it("does not limit unknown hosts", async () => {
    expect(await acquireToken("example.com")).toBe(0);
  });
});
