import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools } from "./harness.js";

// The schema-lookup fallback of steam_getGlobalStatsForGame (#87): without
// stat_names, the tool reads stat names from GetSchemaForGame, which needs a key.
const handler = registeredTools().get("steam_getGlobalStatsForGame")!.handler;

function schemaWith(count: number) {
  const stats = Array.from({ length: count }, (_, i) => ({ name: `stat_${i}` }));
  return { game: { availableGameStats: { stats } } };
}

/** Answers GetSchemaForGame with `schema` and GetGlobalStatsForGame with a success. */
function steamWith(schema: unknown) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes("GetSchemaForGame")
      ? schema
      : { response: { result: 1, globalstats: { stat_0: { total: 5 } } } };
    return new Response(JSON.stringify(body));
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("steam_getGlobalStatsForGame without stat_names", () => {
  it("asks for stat_names when no key is set, without calling Steam", async () => {
    vi.stubEnv("STEAM_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await handler({ appid: 480 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Pass stat_names");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an app whose schema has no stats", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    vi.stubGlobal("fetch", steamWith(schemaWith(0)));

    const result = await handler({ appid: 480 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("has no stats");
  });

  it("requests at most 50 of the schema's stat names", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    const fetchMock = steamWith(schemaWith(60));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handler({ appid: 480 });
    expect(result.isError).toBeUndefined();
    const statsUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(statsUrl.pathname).toContain("GetGlobalStatsForGame");
    expect(statsUrl.searchParams.get("count")).toBe("50");
    expect(statsUrl.searchParams.get("name[49]")).toBe("stat_49");
    expect(statsUrl.searchParams.has("name[50]")).toBe(false);

    // The output says the rest were left out (#121).
    const data = JSON.parse(result.content[0].text);
    expect(data.schema_stat_count).toBe(60);
    expect(data.skipped).toBe(10);
    expect(data.note).toContain("stat_names");
  });

  it("adds no skip note when the schema fits in one request", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    vi.stubGlobal("fetch", steamWith(schemaWith(3)));

    const data = JSON.parse((await handler({ appid: 480 })).content[0].text);
    expect(data).not.toHaveProperty("skipped");
    expect(data).not.toHaveProperty("schema_stat_count");
  });
});
