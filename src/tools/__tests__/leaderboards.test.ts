import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../getLeaderboardsForGame.js";
import { register as registerEntries } from "../getLeaderboardEntries.js";
import { register as registerUpload } from "../uploadLeaderboardScore.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ text: string }>;
  isError?: boolean;
}>;

function captureHandler(registerFn: (server: McpServer) => void = register): Handler {
  let handler: Handler | undefined;
  registerFn({
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

const BOARDS = {
  response: {
    leaderboards: [
      { id: 101, name: "SpeedrunAny%", display_name: "Speedrun (Any%)" },
      { id: 102, name: "HighScore", display_name: "High Score" },
    ],
  },
};

/** First call answers GetLeaderboardsForGame, later calls answer with `next`. */
function boardsThen(next: unknown) {
  return vi.fn().mockImplementation(async (url: string) =>
    new Response(JSON.stringify(url.includes("GetLeaderboardsForGame") ? BOARDS : next)),
  );
}

describe("leaderboard_name (#80)", () => {
  it("getLeaderboardEntries resolves a name to its ID and reports resolved_from", async () => {
    const fetchMock = boardsThen({
      leaderboardEntryInformation: { appID: 480, leaderboardID: 101, leaderboardEntries: [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler(registerEntries)({ appid: 480, leaderboard_name: "speedrunany%" });
    expect(result.isError).toBeUndefined();
    const entriesUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(entriesUrl.pathname).toContain("GetLeaderboardEntries");
    expect(entriesUrl.searchParams.get("leaderboardid")).toBe("101");
    expect(JSON.parse(result.content[0].text).resolved_from).toBe("speedrunany%");
  });

  it("matches the display name too", async () => {
    const fetchMock = boardsThen({ leaderboardEntryInformation: { leaderboardID: 102 } });
    vi.stubGlobal("fetch", fetchMock);

    await captureHandler(registerEntries)({ appid: 480, leaderboard_name: "High Score" });
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("leaderboardid")).toBe("102");
  });

  it("lists the existing names when nothing matches", async () => {
    const fetchMock = boardsThen({});
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler(registerEntries)({ appid: 480, leaderboard_name: "Nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No leaderboard named "Nope"');
    expect(result.content[0].text).toContain("SpeedrunAny%, HighScore");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires exactly one of leaderboardid and leaderboard_name", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const handler = captureHandler(registerEntries);

    const both = await handler({ appid: 480, leaderboardid: 1, leaderboard_name: "HighScore" });
    expect(both.isError).toBe(true);
    expect(both.content[0].text).toContain("not both");
    const neither = await handler({ appid: 480 });
    expect(neither.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploadLeaderboardScore dry run shows the resolved leaderboardid", async () => {
    const fetchMock = boardsThen({});
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler(registerUpload)({
      appid: 480,
      leaderboard_name: "HighScore",
      steamid: "76561197960287930",
      score: 10,
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.dry_run).toBe(true);
    expect(payload.would_send.params.leaderboardid).toBe(102);
    expect(payload.would_send.resolved_from).toBe("HighScore");
    // Only the read-only lookup ran; nothing was written.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("GetLeaderboardsForGame");
  });

  it("uploadLeaderboardScore refuses a live call by name before any network I/O", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler(registerUpload)({
      appid: 480,
      leaderboard_name: "HighScore",
      steamid: "76561197960287930",
      score: 10,
      dry_run: false,
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("needs the numeric leaderboardid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
