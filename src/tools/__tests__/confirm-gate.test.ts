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
    tool(...args: unknown[]) {
      const cb = args[args.length - 1];
      if (typeof cb !== "function") {
        throw new Error("server.tool did not receive a handler");
      }
      handler = cb as ToolHandler;
    },
  };
  register(server as unknown as McpServer);
  if (!handler) {
    throw new Error("register() did not call server.tool");
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
    liveBody: {},
  },
  {
    name: "steam_clearAchievement",
    register: registerClearAchievement,
    args: { steamid: STEAMID, appid: 480, achievement: "ACH_WIN_ONE_GAME" },
    liveBody: {},
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
    liveBody: { success: 1 },
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
        expect(result.content[0].text).toBeTruthy();
      });
    });
  }
});
