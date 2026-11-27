import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { registeredTools, jsonFetch } from "./harness.js";

// Tools that declare an outputSchema must return structuredContent that
// validates against it, alongside the same data as a JSON text block (#93).

const tools = registeredTools();

/** Answers each compareApps endpoint with a realistic body. */
async function compareFetch(url: string): Promise<Response> {
  const u = new URL(url);
  const json = (body: unknown) => new Response(JSON.stringify(body));
  if (u.pathname === "/api/appdetails") {
    const appid = u.searchParams.get("appids")!;
    if (appid === "400") return json({ [appid]: { success: false } });
    return json({
      [appid]: {
        success: true,
        data: {
          name: "Portal 2",
          developers: ["Valve"],
          price_overview: { final_formatted: "$9.99", discount_percent: 0 },
          release_date: { date: "Apr 18, 2011", coming_soon: false },
          genres: [{ description: "Action" }],
          metacritic: { score: 95 },
          supported_languages: "English<strong>*</strong>, French",
        },
      },
    });
  }
  if (u.pathname.includes("GetAppReviews")) {
    return json({ response: { query_summary: { review_score_desc: "Overwhelmingly Positive", total_reviews: 100, total_positive: 98 } } });
  }
  if (u.pathname.includes("GetNumberOfCurrentPlayers")) return json({ response: { player_count: 1234, result: 1 } });
  return json({});
}

const salesFixture = {
  response: {
    results: [
      { country_code: "US", net_units_sold: 3, gross_sales_usd: "29.97", net_sales_usd: "29.97" },
      { country_code: "DE", net_units_sold: 1, gross_sales_usd: "9.99", net_sales_usd: "9.99" },
    ],
    country_info: [{ country_code: "US", country_name: "United States" }],
    max_id: "0",
  },
};

const CASES: Record<string, { args: Record<string, unknown>; fixture?: unknown; fetch?: (url: string) => Promise<Response> }> = {
  steam_getPlayerCount: {
    args: { appid: 440 },
    fixture: { response: { player_count: 82269, result: 1 } },
  },
  steam_getAppReviewSummary: {
    args: { appid: 440 },
    fixture: {
      success: 1,
      response: {
        query_summary: { review_score: 8, review_score_desc: "Very Positive", total_reviews: 10, total_positive: 9, total_negative: 1 },
        reviews: [],
      },
    },
  },
  steam_getPriceOverview: {
    args: { appids: [620, 570, 999999] },
    fixture: {
      "620": { success: true, data: { price_overview: { currency: "USD", initial: 999, final: 199, discount_percent: 80, initial_formatted: "$9.99", final_formatted: "$1.99" } } },
      "570": { success: true, data: [] },
      "999999": { success: false },
    },
  },
  steam_compareApps: {
    args: { appids: [620, 400] },
    fetch: compareFetch,
  },
  steam_getSalesSummary: {
    args: { start_date: "2026-10-01", end_date: "2026-10-02", compare_previous: true },
    fixture: salesFixture,
  },
};

beforeEach(() => {
  vi.stubEnv("STEAM_FINANCIAL_API_KEY", "TESTKEY_NOT_REAL");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("structured output", () => {
  const withSchema = [...tools.values()].filter((t) => t.outputSchema);

  it("covers every tool that declares an outputSchema", () => {
    expect(withSchema.map((t) => t.name).sort()).toEqual(Object.keys(CASES).sort());
  });

  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: structuredContent validates and matches the text block`, async () => {
      const tool = tools.get(name)!;
      vi.stubGlobal("fetch", vi.fn(c.fetch ?? jsonFetch(c.fixture)));

      const result = await tool.handler(c.args);
      expect(result.isError).toBeUndefined();
      const parsed = z.object(tool.outputSchema!).strict().safeParse(result.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    });
  }

  it("passes the SDK's own output validation end to end", async () => {
    vi.stubGlobal("fetch", vi.fn(jsonFetch(CASES.steam_getPlayerCount.fixture)));
    const { server } = createServer(["store"], "stdio");
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const listed = (await client.listTools()).tools.find((t) => t.name === "steam_getPlayerCount");
    expect(listed?.outputSchema).toBeDefined();
    const result = await client.callTool({ name: "steam_getPlayerCount", arguments: { appid: 440 } });
    expect(result.structuredContent).toEqual({ appid: 440, player_count: 82269 });
    await client.close();
  });

  it("steam_compareApps keeps a failed app's error row in structuredContent (#144)", async () => {
    vi.stubGlobal("fetch", vi.fn(compareFetch));
    const result = await tools.get("steam_compareApps")!.handler({ appids: [620, 400] });
    const apps = (result.structuredContent as { apps: Array<Record<string, unknown>> }).apps;
    expect(apps[0]).toMatchObject({ appid: 620, name: "Portal 2", price: "$9.99", review_positive_pct: 98, current_players: 1234 });
    expect(apps[1]).toMatchObject({ appid: 400, error: expect.stringContaining("delisted") });
    expect(apps[1].name).toBeUndefined();
  });

  it("steam_getSalesSummary format csv passes the SDK's output validation, with the JSON summary as structuredContent (#144)", async () => {
    vi.stubGlobal("fetch", vi.fn(jsonFetch(salesFixture)));
    const { server } = createServer(["publisher"], "stdio");
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const result = (await client.callTool({
      name: "steam_getSalesSummary",
      arguments: { start_date: "2026-10-01", format: "csv" },
    })) as { isError?: boolean; content: Array<{ text: string }>; structuredContent?: Record<string, unknown> };
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text.split("\n")[0]).toContain("country");
    expect(result.structuredContent).toMatchObject({ group_by: "country", totals: { net_sales_usd: 39.96 } });
    await client.close();
  });

  it("still returns a plain isError result when Steam fails", async () => {
    vi.stubGlobal("fetch", vi.fn(jsonFetch({ response: { result: 42 } })));
    const { server } = createServer(["store"], "stdio");
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const result = await client.callTool({ name: "steam_getPlayerCount", arguments: { appid: 1 } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    await client.close();
  });
});
