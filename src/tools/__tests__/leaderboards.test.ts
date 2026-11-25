import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../getLeaderboardsForGame.js";
import { register as registerEntries } from "../getLeaderboardEntries.js";
import { register as registerUpload } from "../uploadLeaderboardScore.js";
import { registeredTools, schemaOf } from "./harness.js";

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

describe("steam_getLeaderboardEntries errors (#86)", () => {
  it("gives the publisher-key guidance on 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Publisher API key");
  });

  it("sends a trimmed STEAM_API_KEY", async () => {
    process.env.STEAM_API_KEY = "abc ";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ leaderboardEntryInformation: { leaderboardID: 1 } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1 });
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("key")).toBe("abc");
  });
});

describe("steam_getLeaderboardEntries range cap (#89)", () => {
  it("refuses more than 500 entries per call and says how to page", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, rangestart: 0, rangeend: 5000 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("At most 500 entries");
    expect(result.content[0].text).toContain("rangeend 499");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows exactly 500 entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ leaderboardEntryInformation: { leaderboardID: 1 } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, rangestart: 100, rangeend: 599 });
    expect(result.isError).toBeUndefined();
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("rangeend")).toBe("599");
  });

  it("rejects rangeend below rangestart", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, rangestart: 10, rangeend: 5 });
    expect(result.isError).toBe(true);
  });
});

describe("steam_getLeaderboardEntries include_names (#99)", () => {
  const ids = Array.from({ length: 150 }, (_, i) => String(76561198000000000n + BigInt(i)));
  const board = () =>
    new Response(
      JSON.stringify({
        leaderboardEntryInformation: {
          leaderboardID: 1,
          leaderboardEntries: ids.map((steamID, i) => ({ steamID, score: 1000 - i, rank: i + 1 })),
        },
      }),
    );

  it("adds personaname, batching 100 IDs per GetPlayerSummaries request", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.includes("GetPlayerSummaries")) {
        const players = u.searchParams.get("steamids")!.split(",").map((steamid) => ({ steamid, personaname: `p${steamid.slice(-3)}` }));
        return new Response(JSON.stringify({ response: { players } }));
      }
      return board();
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, rangeend: 149, include_names: true });
    const body = JSON.parse(result.content[0].text);
    const summaryCalls = fetchMock.mock.calls.map((c) => new URL(c[0] as string)).filter((u) => u.pathname.includes("GetPlayerSummaries"));
    expect(summaryCalls).toHaveLength(2);
    expect(summaryCalls[0].host).toBe("api.steampowered.com");
    expect(summaryCalls[0].searchParams.get("steamids")!.split(",")).toHaveLength(100);
    expect(summaryCalls[1].searchParams.get("steamids")!.split(",")).toHaveLength(50);
    expect(body.leaderboardEntries[0]).toEqual({ steamID: ids[0], score: 1000, rank: 1, personaname: "p000" });
    expect(body.leaderboardEntries[149].personaname).toBe("p149");
    expect(body).not.toHaveProperty("names_warning");
  });

  it("leaves the output unchanged by default", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => board());
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.parse((await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, rangeend: 149 })).content[0].text);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.leaderboardEntries[0]).toEqual({ steamID: ids[0], score: 1000, rank: 1 });
  });

  it("keeps the entries and warns when the name lookup fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      new URL(url).pathname.includes("GetPlayerSummaries") ? new Response("", { status: 403 }) : board(),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, rangeend: 149, include_names: true });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.leaderboardEntries).toHaveLength(150);
    expect(body.leaderboardEntries[0]).not.toHaveProperty("personaname");
    expect(body.names_warning).toContain("could not be looked up");
  });
});

describe("steam_getLeaderboardEntries around-user range (#100)", () => {
  const ok = () => new Response(JSON.stringify({ leaderboardEntryInformation: { leaderboardID: 1 } }));
  const steamid = "76561198000000000";

  it("accepts a negative rangestart in the input schema", () => {
    const schema = schemaOf(registeredTools().get("steam_getLeaderboardEntries")!);
    expect(schema.safeParse({ appid: 480, leaderboardid: 1, datarequest: 1, steamid, rangestart: -5, rangeend: 5 }).success).toBe(true);
  });

  it("sends a negative rangestart for datarequest 1", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, datarequest: 1, steamid, rangestart: -5, rangeend: 5 });
    expect(result.isError).toBeUndefined();
    const sent = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(sent.get("rangestart")).toBe("-5");
    expect(sent.get("rangeend")).toBe("5");
  });

  it("defaults around-user requests to 10 above and 10 below", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, datarequest: 1, steamid });
    const sent = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect([sent.get("rangestart"), sent.get("rangeend")]).toEqual(["-10", "10"]);
  });

  it.each([0, 2, undefined])("still rejects a negative range with datarequest %s", async (datarequest) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, datarequest, steamid, rangestart: -5, rangeend: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("0 or more");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the 500-entry cap for around-user windows", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await captureHandler(registerEntries)({ appid: 480, leaderboardid: 1, datarequest: 1, steamid, rangestart: -300, rangeend: 300 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("At most 500 entries");
  });
});
