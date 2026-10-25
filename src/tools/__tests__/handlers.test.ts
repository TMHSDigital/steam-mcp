import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registeredTools, jsonFetch, schemaOf } from "./harness.js";

// One success-path and one error-path case per tool, run against the real
// registered handlers with fetch stubbed. Fixture bodies are trimmed copies of
// real Steam responses. A tool added without a case here fails the last test.

const STEAMID = "76561197960435530";

interface Case {
  args: Record<string, unknown>;
  /** Response body for the success path. Omit for tools that never fetch. */
  fixture?: unknown;
  /** Substrings the success output must contain. */
  expect: string[];
  /** Host the request must go to. */
  host?: string;
  needsKey?: boolean;
  /** Body that must produce isError (default: HTTP 404). Omit with `noFetch`. */
  errorFixture?: unknown;
  noFetch?: boolean;
}

const pngPath = (() => {
  const dir = mkdtempSync(join(tmpdir(), "steam-handlers-"));
  const path = join(dir, "not-an-image.png");
  writeFileSync(path, "plain text");
  return path;
})();

const CASES: Record<string, Case> = {
  steam_getAppDetails: {
    args: { appid: 440 },
    fixture: { "440": { success: true, data: { type: "game", name: "Team Fortress 2", steam_appid: 440, is_free: true } } },
    expect: ['"name":"Team Fortress 2"'],
    host: "store.steampowered.com",
    errorFixture: { "440": { success: false } },
  },
  steam_searchApps: {
    args: { query: "portal" },
    fixture: { total: 1, items: [{ type: "app", name: "Portal 2", id: 620 }] },
    expect: ['"name": "Portal 2"'],
    host: "store.steampowered.com",
  },
  steam_getPlayerCount: {
    args: { appid: 440 },
    fixture: { response: { player_count: 82269, result: 1 } },
    expect: ['"player_count": 82269'],
    host: "api.steampowered.com",
  },
  steam_getAchievementStats: {
    args: { appid: 440 },
    fixture: { achievementpercentages: { achievements: [{ name: "TF_PLAY_GAME_EVERYCLASS", percent: 62.1 }] } },
    expect: ["TF_PLAY_GAME_EVERYCLASS"],
    host: "api.steampowered.com",
    errorFixture: { achievementpercentages: { achievements: [] } },
  },
  steam_getPlayerSummary: {
    args: { steamid: STEAMID },
    fixture: { response: { players: [{ steamid: STEAMID, personaname: "Rabscuttle" }] } },
    expect: ['"personaname": "Rabscuttle"'],
    needsKey: true,
    errorFixture: { response: { players: [] } },
  },
  steam_getOwnedGames: {
    args: { steamid: STEAMID },
    fixture: { response: { game_count: 1, games: [{ appid: 440, playtime_forever: 120 }] } },
    expect: ['"game_count":1'],
    needsKey: true,
    errorFixture: { response: {} },
  },
  steam_getWorkshopItem: {
    args: { publishedfileid: "814498849" },
    fixture: { response: { publishedfiledetails: [{ result: 1, publishedfileid: "814498849", title: "A map", description: "desc" }] } },
    expect: ['"title": "A map"', "_warning"],
    errorFixture: { response: { publishedfiledetails: [{ result: 9 }] } },
  },
  steam_queryWorkshop: {
    args: { appid: 4000 },
    fixture: { response: { total: 1, publishedfiledetails: [{ publishedfileid: "1", title: "Item" }] } },
    expect: ['"total": 1', "_warning"],
    needsKey: true,
    errorFixture: {},
  },
  steam_getLeaderboardEntries: {
    args: { appid: 480, leaderboardid: 1 },
    fixture: { leaderboardEntryInformation: { appID: 480, leaderboardID: 1, totalLeaderBoardEntryCount: 1, leaderboardEntries: [] } },
    expect: ['"totalLeaderBoardEntryCount": 1'],
    host: "partner.steam-api.com",
    needsKey: true,
    errorFixture: {},
  },
  steam_resolveVanityURL: {
    args: { vanityurl: "gabelogannewell" },
    fixture: { response: { success: 1, steamid: "76561197960287930" } },
    expect: ['"steamid": "76561197960287930"'],
    needsKey: true,
    errorFixture: { response: { success: 42, message: "No match" } },
  },
  steam_createLobby: {
    args: { type: "public", max_members: 4 },
    expect: ["CreateLobby"],
    noFetch: true,
  },
  steam_uploadWorkshopItem: {
    args: { appid: 480, title: "My item" },
    expect: ["CreateItem"],
    noFetch: true,
  },
  steam_updateWorkshopItem: {
    args: { publishedfileid: "1", appid: 480, title: "New" },
    expect: ['"dry_run": true'],
    noFetch: true,
  },
  steam_setAchievement: {
    args: { steamid: STEAMID, appid: 480, achievement: "ACH_WIN" },
    expect: ['"dry_run": true'],
    noFetch: true,
  },
  steam_uploadLeaderboardScore: {
    args: { appid: 480, leaderboardid: 1, steamid: STEAMID, score: 10 },
    expect: ['"dry_run": true'],
    noFetch: true,
  },
  steam_grantInventoryItem: {
    args: { appid: 480, steamid: STEAMID, itemdefid: 100 },
    expect: ['"dry_run": true'],
    noFetch: true,
  },
  steam_clearAchievement: {
    args: { steamid: STEAMID, appid: 480, achievement: "ACH_WIN" },
    expect: ['"dry_run": true'],
    noFetch: true,
  },
  steam_getReviews: {
    args: { appid: 440 },
    fixture: { response: { query_summary: { num_reviews: 1 }, reviews: [{ review: "fun" }], cursor: "abc" } },
    expect: ['"cursor": "abc"', "_warning"],
    host: "api.steampowered.com",
    errorFixture: { response: {} },
  },
  steam_getAppReviewSummary: {
    args: { appid: 440 },
    fixture: { response: { query_summary: { num_reviews: 1, review_score: 8, review_score_desc: "Very Positive", total_positive: 9, total_negative: 1, total_reviews: 10 } } },
    expect: ['"positive_percentage": 90'],
    errorFixture: { response: {} },
  },
  steam_getPriceOverview: {
    args: { appids: [570940] },
    fixture: { "570940": { success: true, data: { price_overview: { currency: "USD", final: 1999, final_formatted: "$19.99" } } } },
    expect: ['"final_formatted": "$19.99"'],
    host: "store.steampowered.com",
  },
  steam_getRegionalPricing: {
    args: { appid: 570940, countries: ["US"] },
    fixture: { "570940": { success: true, data: { price_overview: { currency: "USD", final: 1999, final_formatted: "$19.99" } } } },
    expect: ['"final_formatted": "$19.99"'],
    host: "store.steampowered.com",
  },
  steam_getSchemaForGame: {
    args: { appid: 440 },
    fixture: { game: { gameName: "Team Fortress 2", availableGameStats: { achievements: [{ name: "TF_PLAY_GAME_EVERYCLASS" }] } } },
    expect: ['"gameName":"Team Fortress 2"'],
    needsKey: true,
    errorFixture: {},
  },
  steam_getNewsForApp: {
    args: { appid: 440 },
    fixture: { appnews: { appid: 440, newsitems: [{ gid: "1", title: "Update" }], count: 1 } },
    expect: ['"title": "Update"', "_warning"],
    host: "api.steampowered.com",
  },
  steam_getLeaderboardsForGame: {
    args: { appid: 480 },
    fixture: { response: { leaderboards: [{ id: 1, name: "Feet Traveled" }] } },
    expect: ['"name": "Feet Traveled"'],
    host: "partner.steam-api.com",
    needsKey: true,
  },
  steam_getPlayerAchievements: {
    args: { steamid: STEAMID, appid: 440 },
    fixture: { playerstats: { steamID: STEAMID, gameName: "Team Fortress 2", success: true, achievements: [] } },
    expect: ['"gameName": "Team Fortress 2"'],
    needsKey: true,
    errorFixture: { playerstats: { success: false } },
  },
  steam_validateStoreAsset: {
    args: { path: pngPath, slot: "mainCapsule" },
    expect: ['"ok": false', "PARSE"],
    noFetch: true,
  },
};

const tools = registeredTools();

beforeEach(() => {
  delete process.env.STEAM_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STEAM_API_KEY;
});

describe.each(Object.entries(CASES))("%s handler", (name, c) => {
  const tool = tools.get(name)!;

  it("accepts its example args under the real schema", () => {
    expect(tool).toBeDefined();
    expect(schemaOf(tool).safeParse(c.args).success).toBe(true);
  });

  it("returns the expected success output", async () => {
    if (c.needsKey) process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
    const fetchMock = vi.fn(c.noFetch ? () => Promise.reject(new Error("no network expected")) : jsonFetch(c.fixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await tool.handler(c.args);
    const text = result.content.map((p) => p.text).join("\n");
    for (const needle of c.expect) {
      expect(text).toContain(needle);
    }
    if (c.noFetch) {
      expect(fetchMock).not.toHaveBeenCalled();
    } else {
      expect(result.isError).toBeUndefined();
      if (c.host) {
        expect(new URL(fetchMock.mock.calls[0][0] as string).host).toBe(c.host);
      }
    }
  });

  if (!c.noFetch) {
    it("returns isError on a failed or empty Steam response", async () => {
      if (c.needsKey) process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
      const fetchMock =
        c.errorFixture !== undefined ? jsonFetch(c.errorFixture) : jsonFetch({}, 404);
      vi.stubGlobal("fetch", vi.fn(fetchMock));

      const result = await tool.handler(c.args);
      // getRegionalPricing reports per-region errors inside a normal result.
      if (name === "steam_getRegionalPricing") {
        expect(result.content[0].text).toMatch(/error/i);
      } else {
        expect(result.isError).toBe(true);
      }
    });
  }

  if (c.needsKey) {
    it("explains a missing STEAM_API_KEY without calling Steam", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await tool.handler(c.args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("STEAM_API_KEY");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

it("every registered tool has a handler case", () => {
  expect([...tools.keys()].filter((name) => !(name in CASES))).toEqual([]);
});
