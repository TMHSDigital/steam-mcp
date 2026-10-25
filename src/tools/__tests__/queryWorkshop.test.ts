import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../queryWorkshop.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ text: string }>;
  isError?: boolean;
}>;

function captureHandler(): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool: (...args: unknown[]) => {
      handler = args[args.length - 1] as Handler;
    },
  };
  register(server as unknown as McpServer);
  return handler!;
}

const fetchMock = vi.fn();

async function query(args: Record<string, unknown>): Promise<URLSearchParams> {
  await captureHandler()({ appid: 4000, ...args });
  return new URL(fetchMock.mock.calls[0][0] as string).searchParams;
}

beforeEach(() => {
  process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
  fetchMock.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ response: { total: 0, publishedfiledetails: [] } })),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.STEAM_API_KEY;
  vi.unstubAllGlobals();
});

describe("steam_queryWorkshop", () => {
  it.each([
    ["vote", "0"],
    ["date", "1"],
    ["trend", "3"],
    ["subscriptions", "9"],
    ["text_search", "12"],
    ["playtime", "14"],
    ["updated", "21"],
  ])("maps sort %s to EPublishedFileQueryType %s", async (sort, queryType) => {
    const params = await query({ sort });
    expect(params.get("query_type")).toBe(queryType);
  });

  it("defaults to newest first, or relevance when searching", async () => {
    expect((await query({})).get("query_type")).toBe("1");
    fetchMock.mockClear();
    expect((await query({ search_text: "castle" })).get("query_type")).toBe("12");
  });

  it("sends tags as indexed array parameters with match_all_tags", async () => {
    const params = await query({ requiredtags: ["Map", "Addon"], excludedtags: ["NSFW"] });
    expect(params.get("requiredtags[0]")).toBe("Map");
    expect(params.get("requiredtags[1]")).toBe("Addon");
    expect(params.has("requiredtags")).toBe(false);
    expect(params.get("match_all_tags")).toBe("true");
    expect(params.get("excludedtags[0]")).toBe("NSFW");
  });

  it("sends days only for trend", async () => {
    expect((await query({ sort: "trend", days: 3 })).get("days")).toBe("3");
    fetchMock.mockClear();
    expect((await query({ sort: "vote", days: 3 })).has("days")).toBe(false);
  });
});
