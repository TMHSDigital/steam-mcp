import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools } from "./harness.js";

const deck = registeredTools().get("steam_getDeckCompatibility")!.handler;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A fetch stub that answers each app after a delay that varies by appid, and counts requests in flight. */
function slowDeckFetch() {
  let inFlight = 0;
  let peak = 0;
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const appid = Number(new URL(url).searchParams.get("nAppID"));
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, (appid * 7) % 13));
    inFlight--;
    return new Response(JSON.stringify({ success: 1, results: { resolved_category: (appid % 3) + 1 } }));
  });
  return { fetchMock, peak: () => peak };
}

describe("steam_getDeckCompatibility fetching (#101)", () => {
  const appids = Array.from({ length: 20 }, (_, i) => 100 + i);

  it("keeps input order with at most 4 requests in flight", async () => {
    const { fetchMock, peak } = slowDeckFetch();
    vi.stubGlobal("fetch", fetchMock);

    const body = JSON.parse((await deck({ appids })).content[0].text);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(body.reports.map((r: { appid: number }) => r.appid)).toEqual(appids);
    expect(body.reports[0].category).toBe(["unsupported", "playable", "verified"][100 % 3]);
    expect(peak()).toBeGreaterThan(1);
    expect(peak()).toBeLessThanOrEqual(4);
  });

  it("serves a repeat call from the cache", async () => {
    vi.stubEnv("STEAM_MCP_CACHE_TTL", "");
    const { fetchMock } = slowDeckFetch();
    vi.stubGlobal("fetch", fetchMock);

    const first = (await deck({ appids: [620, 400] })).content[0].text;
    const second = (await deck({ appids: [620, 400] })).content[0].text;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second).toBe(first);
  });
});
