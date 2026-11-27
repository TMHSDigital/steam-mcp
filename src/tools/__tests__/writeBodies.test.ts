import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools, jsonFetch } from "./harness.js";

// Exact request bodies of live write tools (#115): a wrong field name or a
// dropped value must fail a test, not ship.
const tools = registeredTools();
const KEY = "TESTKEY_NOT_REAL";
const STEAMID = "76561197960435530";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function liveBody(name: string, args: Record<string, unknown>, response: unknown) {
  vi.stubEnv("STEAM_API_KEY", KEY);
  const fetchMock = vi.fn(jsonFetch(response));
  vi.stubGlobal("fetch", fetchMock);
  const result = await tools.get(name)!.handler({ ...args, dry_run: false, confirm: true });
  expect(result.isError).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return Object.fromEntries(new URLSearchParams(String(init.body)));
}

describe("steam_updateWorkshopItem request body", () => {
  const args = {
    publishedfileid: "12345",
    appid: 480,
    title: "T",
    file_description: "D",
    visibility: 2,
    tags: ["a", "b"],
  };
  const params = {
    publishedfileid: "12345",
    appid: "480",
    title: "T",
    file_description: "D",
    visibility: "2",
    "tags[0]": "a",
    "tags[1]": "b",
  };

  it("sends every field, tags indexed", async () => {
    expect(await liveBody("steam_updateWorkshopItem", args, { response: {} })).toEqual({ key: KEY, ...params });
  });

  it("the dry-run plan shows the same params without the key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await tools.get("steam_updateWorkshopItem")!.handler(args);
    const plan = JSON.parse(result.content[0].text).would_send.params;
    // The plan holds typed values; compare them as the form would send them.
    expect(Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, String(v)]))).toEqual(params);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("steam_uploadLeaderboardScore request body", () => {
  const args = { appid: 480, leaderboardid: 1, steamid: STEAMID, score: 100 };
  const ok = { result: { result: 1, score_changed: true } };

  it("defaults scoremethod to KeepBest", async () => {
    expect(await liveBody("steam_uploadLeaderboardScore", args, ok)).toEqual({
      key: KEY,
      appid: "480",
      leaderboardid: "1",
      steamid: STEAMID,
      score: "100",
      scoremethod: "KeepBest",
    });
  });

  it("passes ForceUpdate through", async () => {
    const body = await liveBody("steam_uploadLeaderboardScore", { ...args, scoremethod: "ForceUpdate" }, ok);
    expect(body.scoremethod).toBe("ForceUpdate");
  });

  it("refuses leaderboardid together with leaderboard_name without calling Steam", async () => {
    vi.stubEnv("STEAM_API_KEY", KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await tools.get("steam_uploadLeaderboardScore")!.handler({
      ...args,
      leaderboard_name: "Best Times",
      dry_run: false,
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
