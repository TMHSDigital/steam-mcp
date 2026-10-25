import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools, jsonFetch } from "./harness.js";
import { stripHtml } from "../../utils/text.js";

const tools = registeredTools();
const run = async (name: string, args: Record<string, unknown>, body: unknown) => {
  vi.stubGlobal("fetch", vi.fn(jsonFetch(body)));
  const result = await tools.get(name)!.handler(args);
  return { text: result.content[0].text, data: JSON.parse(result.content[0].text) };
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STEAM_API_KEY;
});

const longHtml = `<p>${"Lorem ipsum dolor sit amet. ".repeat(400)}</p>`;
const appData = {
  steam_appid: 620,
  name: "Portal 2",
  type: "game",
  is_free: false,
  short_description: "Sequel &amp; more <b>puzzles</b>",
  detailed_description: longHtml,
  about_the_game: longHtml,
  pc_requirements: { minimum: "<strong>OS:</strong> Windows 7" },
  genres: [{ id: "1", description: "Action" }],
  categories: [{ id: 2, description: "Single-player" }],
  recommendations: { total: 300000 },
  dlc: [1, 2, 3],
  screenshots: [{ id: 0, path_full: "https://example/1.jpg" }],
};

describe("steam_getAppDetails output size", () => {
  const body = { "620": { success: true, data: appData } };

  it("returns a compact summary by default", async () => {
    const { text, data } = await run("steam_getAppDetails", { appid: 620 }, body);
    expect(text.length).toBeLessThan(8 * 1024);
    expect(data.short_description).toBe("Sequel & more puzzles");
    expect(data.genres).toEqual(["Action"]);
    expect(data.recommendations).toBe(300000);
    expect(data.dlc_count).toBe(3);
    expect(data).not.toHaveProperty("detailed_description");
  });

  it("full mode strips HTML and truncates long text unless include_html", async () => {
    const full = (await run("steam_getAppDetails", { appid: 620, detail: "full" }, body)).data;
    expect(full.detailed_description).toMatch(/\[truncated, \d+ chars\]$/);
    expect(full.detailed_description).not.toContain("<p>");
    expect(full.pc_requirements.minimum).toBe("OS: Windows 7");

    const raw = (await run("steam_getAppDetails", { appid: 620, detail: "full", include_html: true }, body)).data;
    expect(raw.detailed_description).toBe(longHtml);
  });

  it("fields picks raw fields", async () => {
    const { data } = await run("steam_getAppDetails", { appid: 620, fields: ["screenshots"] }, body);
    expect(Object.keys(data).sort()).toEqual(["screenshots", "steam_appid"]);
  });
});

describe("steam_getOwnedGames output size", () => {
  const games = Array.from({ length: 2000 }, (_, i) => ({
    appid: i + 1,
    name: `Game ${i + 1}`,
    playtime_forever: i,
    playtime_2weeks: i % 7 === 0 ? 2000 - i : 0,
  }));
  const body = { response: { game_count: games.length, games } };

  it("returns the top 50 by playtime with library totals", async () => {
    process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
    const { data } = await run("steam_getOwnedGames", { steamid: "76561197960435530" }, body);
    expect(data.game_count).toBe(2000);
    expect(data.returned).toBe(50);
    expect(data.games[0].appid).toBe(2000);
    expect(data.total_playtime_minutes).toBe((1999 * 2000) / 2);
  });

  it("filters by appids and sorts by recent playtime", async () => {
    process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
    const { data } = await run(
      "steam_getOwnedGames",
      { steamid: "76561197960435530", appids: [8, 15, 99999], sort: "recent" },
      body,
    );
    expect(data.games.map((g: { appid: number }) => g.appid)).toEqual([8, 15]);
  });
});

describe("steam_getSchemaForGame output size", () => {
  const achievements = Array.from({ length: 520 }, (_, i) => ({
    name: `ACH_${i}`,
    displayName: `Achievement ${i}`,
    icon: `https://example/icon${i}.jpg`,
    icongray: `https://example/gray${i}.jpg`,
  }));
  const body = { game: { gameName: "Big Game", availableGameStats: { achievements, stats: [{ name: "kills" }] } } };

  it("limits achievements and drops icons by default", async () => {
    process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
    const { data } = await run("steam_getSchemaForGame", { appid: 1 }, body);
    expect(data.achievement_count).toBe(520);
    expect(data.achievements).toHaveLength(100);
    expect(data.achievements[0]).not.toHaveProperty("icon");
    expect(data.stats).toHaveLength(1);
  });

  it("include_icons and include_stats: false", async () => {
    process.env.STEAM_API_KEY = "TESTKEY_NOT_REAL";
    const { data } = await run(
      "steam_getSchemaForGame",
      { appid: 1, include_icons: true, include_stats: false, limit: 5 },
      body,
    );
    expect(data.achievements[0].icon).toBeDefined();
    expect(data).not.toHaveProperty("stats");
  });
});

describe("stripHtml", () => {
  it("removes tags, decodes entities, and keeps line breaks", () => {
    expect(stripHtml("A&nbsp;&amp;&#39;B<br>C<li>D</li>")).toBe("A &'B\nC\nD");
  });
});
