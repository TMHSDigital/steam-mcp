import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  steamFetch,
  retryDelayMs,
  publisherErrorResponse,
} from "../steam-api.js";
import {
  SteamApiError,
  InvalidApiKeyError,
  SteamUnavailableError,
} from "../errors.js";

function res(status: number, body = "", headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe("retryDelayMs", () => {
  it("parses delta-seconds", () => {
    expect(retryDelayMs("3", 0)).toBe(3000);
  });

  it("parses an HTTP-date instead of returning NaN", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    expect(retryDelayMs("Sun, 25 Oct 2026 12:00:04 GMT", 0)).toBe(4000);
    vi.useRealTimers();
  });

  it("caps long waits at 10s and clamps past dates to 0", () => {
    expect(retryDelayMs("3600", 0)).toBe(10_000);
    expect(retryDelayMs("Thu, 01 Jan 1970 00:00:00 GMT", 0)).toBe(0);
  });

  it("falls back to backoff for garbage", () => {
    const ms = retryDelayMs("soon", 1);
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThanOrEqual(2500);
  });
});

describe("steamFetch transient errors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries 503 and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200, '{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    const pending = steamFetch("https://api.steampowered.com/test");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on repeated 502 with SteamUnavailableError", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(res(502)));
    vi.stubGlobal("fetch", fetchMock);

    const pending = steamFetch("https://api.steampowered.com/test");
    const assertion = expect(pending).rejects.toThrow(SteamUnavailableError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a plain 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(steamFetch("https://api.steampowered.com/test")).rejects.toThrow(
      SteamUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("steamFetch error detail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("describes an HTML body instead of hiding it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res(200, "<!DOCTYPE html>\n<html><body>Store page</body></html>", {
          "content-type": "text/html; charset=UTF-8",
        }),
      ),
    );

    const err = await steamFetch("https://store.steampowered.com/appreviews/440?json=1").catch(
      (e: unknown) => e,
    );
    expect((err as Error).message).toContain("text/html");
    expect((err as Error).message).toContain("<!DOCTYPE html>");
    expect((err as Error).message).toContain("endpoint may be retired or require login");
  });

  it("includes X-eresult and X-error_message, and keeps the key out of endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res(400, "", { "x-eresult": "8", "x-error_message": "Invalid leaderboard" }),
      ),
    );

    const err = (await steamFetch(
      "https://partner.steam-api.com/ISteamLeaderboards/x/v1/?key=SECRET",
    ).catch((e: unknown) => e)) as SteamApiError;

    expect(err).toBeInstanceOf(SteamApiError);
    expect(err.message).toBe("Steam API returned HTTP 400 (EResult 8: Invalid leaderboard)");
    expect(err.eresult).toBe(8);
    expect(err.endpoint).toBe("https://partner.steam-api.com/ISteamLeaderboards/x/v1/");
  });

  it("falls back to a JSON body error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res(400, JSON.stringify({ playerstats: { error: "Requested app has no stats", success: false } })),
      ),
    );

    const err = (await steamFetch("https://api.steampowered.com/x").catch(
      (e: unknown) => e,
    )) as SteamApiError;
    expect(err.steamMessage).toBe("Requested app has no stats");
  });

  it("recognizes Steam's invalid-key 403 page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res(
          403,
          "<html><body><h1>Forbidden</h1>Access is denied. Retrying will not help. Please verify your <pre>key=</pre> parameter.</body></html>",
        ),
      ),
    );

    await expect(steamFetch("https://api.steampowered.com/x?key=BAD")).rejects.toThrow(
      InvalidApiKeyError,
    );
  });
});

describe("publisherErrorResponse", () => {
  it("does not blame the key for a 400", () => {
    const text = publisherErrorResponse(
      new SteamApiError("x", 400, undefined, 8, "Invalid achievement"),
    ).content[0].text;
    expect(text).not.toContain("STEAM_API_KEY");
    expect(text).toContain("Steam rejected the request");
    expect(text).toContain("EResult 8: Invalid achievement");
  });

  it("gives the allowlist hint for 401 and 403", () => {
    for (const status of [401, 403]) {
      expect(publisherErrorResponse(new SteamApiError("x", status)).content[0].text).toContain(
        "Publisher API key",
      );
    }
  });
});
