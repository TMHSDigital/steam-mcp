import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as registerGrantInventoryItem } from "../grantInventoryItem.js";
import { register as registerSetAchievement } from "../setAchievement.js";
import { register as registerClearAchievement } from "../clearAchievement.js";
import { register as registerUploadLeaderboardScore } from "../uploadLeaderboardScore.js";
import { register as registerUpdateWorkshopItem } from "../updateWorkshopItem.js";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

function captureHandler(register: (server: McpServer) => void): ToolHandler {
  let handler: ToolHandler | undefined;
  const server = {
    registerTool(...args: unknown[]) {
      const cb = args[args.length - 1];
      if (typeof cb !== "function") {
        throw new Error("server.registerTool did not receive a handler");
      }
      handler = cb as ToolHandler;
    },
  };
  register(server as unknown as McpServer);
  if (!handler) {
    throw new Error("register() did not call server.registerTool");
  }
  return handler;
}

function okFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  });
}

const STEAMID = "76561197960435530";

const tools = [
  {
    name: "steam_grantInventoryItem",
    register: registerGrantInventoryItem,
    args: { appid: 480, steamid: STEAMID, itemdefid: 100 },
    liveBody: { response: { item_json: "[]" } },
  },
  {
    name: "steam_setAchievement",
    register: registerSetAchievement,
    args: { steamid: STEAMID, appid: 480, achievement: "ACH_WIN_ONE_GAME" },
    liveBody: { result: { result: 1 } },
  },
  {
    name: "steam_clearAchievement",
    register: registerClearAchievement,
    args: { steamid: STEAMID, appid: 480, achievement: "ACH_WIN_ONE_GAME" },
    liveBody: { result: { result: 1 } },
  },
  {
    name: "steam_uploadLeaderboardScore",
    register: registerUploadLeaderboardScore,
    args: {
      appid: 480,
      leaderboardid: 1,
      steamid: STEAMID,
      score: 100,
    },
    liveBody: {
      result: {
        result: 1,
        score_changed: true,
        global_rank_new: 1,
        global_rank_previous: 2,
        leaderboard_entry_count: 10,
      },
    },
  },
  {
    name: "steam_updateWorkshopItem",
    register: registerUpdateWorkshopItem,
    args: { publishedfileid: "12345", appid: 480, title: "Updated" },
    liveBody: { response: {} },
  },
] as const;

describe("confirm gate for Partner API write tools", () => {
  const originalKey = process.env.STEAM_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.STEAM_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.STEAM_API_KEY = originalKey;
    } else {
      delete process.env.STEAM_API_KEY;
    }
  });

  for (const tool of tools) {
    describe(tool.name, () => {
      it("calling with no flags returns a dry-run response and performs no fetch", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("network should not be called"));
        vi.stubGlobal("fetch", fetchMock);

        const handler = captureHandler(tool.register);
        const result = await handler({ ...tool.args });
        const text = result.content[0].text;
        const payload = JSON.parse(text) as { dry_run?: boolean; tool?: string };

        expect(result.isError).toBeUndefined();
        expect(payload.dry_run).toBe(true);
        expect(payload.tool).toBe(tool.name);
        expect(text).toContain("Nothing was sent");
        expect(text).not.toContain("STEAM_API_KEY");
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("calling with dry_run: false and no confirm returns [CONFIRM_REQUIRED] and performs no fetch", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("network should not be called"));
        vi.stubGlobal("fetch", fetchMock);

        const handler = captureHandler(tool.register);
        const result = await handler({ ...tool.args, dry_run: false });
        const text = result.content[0].text;

        expect(result.isError).toBe(true);
        expect(text).toContain("[CONFIRM_REQUIRED]");
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("calling with dry_run: false, confirm: true reaches the fetch path", async () => {
        process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
        const fetchMock = okFetch(tool.liveBody);
        vi.stubGlobal("fetch", fetchMock);

        const handler = captureHandler(tool.register);
        const result = await handler({
          ...tool.args,
          dry_run: false,
          confirm: true,
        });

        expect(fetchMock).toHaveBeenCalled();
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text).success).toBe(true);
      });

      it("sends the API key in the POST body, never the URL", async () => {
        process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
        const fetchMock = okFetch(tool.liveBody);
        vi.stubGlobal("fetch", fetchMock);

        const handler = captureHandler(tool.register);
        await handler({ ...tool.args, dry_run: false, confirm: true });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).not.toContain("TESTKEY_NOT_REAL");
        expect(init.method).toBe("POST");
        expect(new URLSearchParams(String(init.body)).get("key")).toBe("TESTKEY_NOT_REAL");
      });

      for (const body of [{}, null, { response: null }, { result: {} }, { result: { result: 8 } }]) {
        it(`reports failure, not success, for response ${JSON.stringify(body)}`, async () => {
          process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
          vi.stubGlobal("fetch", okFetch(body));

          const handler = captureHandler(tool.register);
          const result = await handler({ ...tool.args, dry_run: false, confirm: true });

          expect(result.isError).toBe(true);
          expect(result.content[0].text).not.toContain('"success": true');
        });
      }

      it("maps HTTP 403 to the publisher-key hint", async () => {
        process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: () => Promise.resolve(""),
            headers: new Headers(),
          }),
        );

        const handler = captureHandler(tool.register);
        const result = await handler({ ...tool.args, dry_run: false, confirm: true });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Publisher API key");
      });
    });
  }
});

describe("steam_grantInventoryItem AddItem body", () => {
  beforeEach(() => {
    process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
  });

  afterEach(() => {
    delete process.env.STEAM_API_KEY;
  });

  it("sends one itemdefid[n] per copy, numeric notify, and a requestid", async () => {
    const fetchMock = okFetch({ response: { item_json: "[]" } });
    vi.stubGlobal("fetch", fetchMock);

    const handler = captureHandler(registerGrantInventoryItem);
    await handler({
      appid: 480,
      steamid: STEAMID,
      itemdefid: 100,
      quantity: 3,
      notify: false,
      requestid: "42",
      dry_run: false,
      confirm: true,
    });

    const body = new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(Object.fromEntries(body)).toEqual({
      key: "TESTKEY_NOT_REAL",
      appid: "480",
      steamid: STEAMID,
      notify: "0",
      requestid: "42",
      "itemdefid[0]": "100",
      "itemdefid[1]": "100",
      "itemdefid[2]": "100",
    });
  });

  it("generates a requestid in the dry-run plan", async () => {
    const handler = captureHandler(registerGrantInventoryItem);
    const result = await handler({ appid: 480, steamid: STEAMID, itemdefid: 100 });

    const plan = JSON.parse(result.content[0].text).would_send.params;
    expect(plan.requestid).toMatch(/^\d+$/);
    expect(plan["itemdefid[0]"]).toBe(100);
    expect(plan.notify).toBe(1);
    expect(plan).not.toHaveProperty("itemdefid");
  });
});
