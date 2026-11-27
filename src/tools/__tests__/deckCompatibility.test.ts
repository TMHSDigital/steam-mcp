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

  it("keeps the other reports when one app's fetch fails (#119)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const appid = Number(new URL(url).searchParams.get("nAppID"));
        if (appid === 2) return new Response("oops", { status: 500 });
        return new Response(JSON.stringify({ success: 1, results: { resolved_category: 3 } }));
      }),
    );

    const result = await deck({ appids: [1, 2, 3] });
    expect(result.isError).toBeUndefined();
    const { reports } = JSON.parse(result.content[0].text);
    expect(reports.map((r: { appid: number }) => r.appid)).toEqual([1, 2, 3]);
    expect(reports[0].category).toBe("verified");
    expect(reports[2].category).toBe("verified");
    expect(reports[1]).toMatchObject({ appid: 2, category: "unknown", error_type: "SteamUnavailableError" });
    expect(reports[1].error).toBeTruthy();
  });

  it("reports an app with no Deck report and reads the SteamOS category", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const appid = Number(new URL(url).searchParams.get("nAppID"));
        const body =
          appid === 1
            ? { success: 0 }
            : {
                success: 1,
                results: {
                  resolved_category: 2,
                  resolved_items: [{ display_type: 3, loc_token: "#SteamDeckVerified_TestResult_InterfaceTextIsNotLegible" }],
                  steamos_resolved_category: 3,
                  steamos_resolved_items: [{ display_type: 4, loc_token: "#SteamOS_TestResult_GameRunsOnSteamOS" }],
                },
              };
        return new Response(JSON.stringify(body));
      }),
    );

    const { reports } = JSON.parse((await deck({ appids: [1, 2] })).content[0].text);
    expect(reports[0]).toEqual({ appid: 1, category: "unknown", error: "No Deck report for this app" });
    expect(reports[1].category).toBe("playable");
    expect(reports[1].tests).toEqual([{ result: "warning", display: "Interface text is not legible" }]);
    expect(reports[1].steamos.category).toBe("verified");
    expect(reports[1].steamos.tests[0].result).toBe("pass");
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
