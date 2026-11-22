import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { registeredTools, jsonFetch } from "./harness.js";

// Tools that declare an outputSchema must return structuredContent that
// validates against it, alongside the same data as a JSON text block (#93).

const tools = registeredTools();

const CASES: Record<string, { args: Record<string, unknown>; fixture: unknown }> = {
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
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("structured output", () => {
  const withSchema = [...tools.values()].filter((t) => t.outputSchema);

  it("covers every tool that declares an outputSchema", () => {
    expect(withSchema.map((t) => t.name).sort()).toEqual(Object.keys(CASES).sort());
  });

  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: structuredContent validates and matches the text block`, async () => {
      const tool = tools.get(name)!;
      vi.stubGlobal("fetch", vi.fn(jsonFetch(c.fixture)));

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
