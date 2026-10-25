import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../getLeaderboardsForGame.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ text: string }>;
  isError?: boolean;
}>;

function captureHandler(): Handler {
  let handler: Handler | undefined;
  register({
    registerTool: (...args: unknown[]) => {
      handler = args[args.length - 1] as Handler;
    },
  } as unknown as McpServer);
  return handler!;
}

beforeEach(() => {
  process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
});

afterEach(() => {
  delete process.env.STEAM_API_KEY;
  vi.unstubAllGlobals();
});

describe("steam_getLeaderboardsForGame", () => {
  it("calls the partner host, where ISteamLeaderboards lives", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ response: { leaderboards: [{ id: 1, name: "Best" }] } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler()({ appid: 480 });
    expect(new URL(fetchMock.mock.calls[0][0] as string).host).toBe("partner.steam-api.com");
    expect(JSON.parse(result.content[0].text).count).toBe(1);
  });

  it("explains that a 403 needs a publisher key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const result = await captureHandler()({ appid: 480 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Publisher API key");
  });
});
