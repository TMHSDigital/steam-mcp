import { describe, it, expect, vi, afterEach } from "vitest";
import { parseSteamId, resolveSteamId } from "../steamid.js";
import { registeredTools } from "../../tools/__tests__/harness.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseSteamId", () => {
  it.each([
    ["76561197960435530", "76561197960435530"],
    ["https://steamcommunity.com/profiles/76561197960435530/", "76561197960435530"],
    ["STEAM_0:0:84901", "76561197960435530"],
    ["STEAM_1:1:0", "76561197960265729"],
    ["[U:1:169802]", "76561197960435530"],
    ["U:1:169802", "76561197960435530"],
  ])("%s -> %s without a network call", (input, steamid) => {
    expect(parseSteamId(input)).toEqual({ steamid });
  });

  it.each([
    ["gabelogannewell", "gabelogannewell"],
    ["https://steamcommunity.com/id/gabelogannewell/", "gabelogannewell"],
    ["steamcommunity.com/id/some_name?l=en", "some_name"],
  ])("%s is the vanity %s", (input, vanity) => {
    expect(parseSteamId(input)).toEqual({ vanity });
  });

  it("rejects input that cannot be a Steam account", () => {
    expect(() => parseSteamId("not a name!")).toThrow(/not a Steam64 ID/);
  });
});

describe("resolveSteamId", () => {
  it("resolves a vanity through ResolveVanityURL and reports where it came from", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    const fetchMock = vi.fn((_input: string | URL | Request) =>
      Promise.resolve(new Response(JSON.stringify({ response: { success: 1, steamid: "76561197960287930" } }))),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveSteamId("https://steamcommunity.com/id/gabelogannewell")).resolves.toEqual({
      steamid: "76561197960287930",
      resolved_from: "https://steamcommunity.com/id/gabelogannewell",
    });
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("vanityurl")).toBe("gabelogannewell");
  });

  it("fails clearly when the vanity does not exist", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ response: { success: 42, message: "No match" } })))),
    );
    await expect(resolveSteamId("nobodyhere")).rejects.toThrow(/No Steam profile has the vanity name "nobodyhere"/);
  });

  it("a Steam64 input needs no lookup and has no resolved_from", async () => {
    await expect(resolveSteamId("76561197960435530")).resolves.toEqual({ steamid: "76561197960435530" });
  });
});

describe("read tools resolve players", () => {
  it("steam_getPlayerSummary echoes the resolved Steam64 ID", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ response: { success: 1, steamid: "76561197960287930" } })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ response: { players: [{ steamid: "76561197960287930", personaname: "Rabscuttle" }] } })),
        ),
    );

    const result = await registeredTools().get("steam_getPlayerSummary")!.handler({ steamid: "gabelogannewell" });
    const body = JSON.parse(result.content[0].text);
    expect(body.steamid).toBe("76561197960287930");
    expect(body.resolved_from).toBe("gabelogannewell");
  });
});

describe("steam_getPlayerSummary with steamids (#139)", () => {
  const tool = () => registeredTools().get("steam_getPlayerSummary")!;

  it("sends every player in one request and lists the ones Steam did not return", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { success: 1, steamid: "76561197960287930" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { success: 42 } })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              players: [
                { steamid: "76561197960287930", personaname: "Rabscuttle" },
                { steamid: "76561197960435530", personaname: "Robin" },
              ],
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await tool().handler({
      steamids: ["gabelogannewell", "76561197960435530", "76561197960265729", "nobodyhere"],
    });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.players.map((p: { personaname: string }) => p.personaname)).toEqual(["Rabscuttle", "Robin"]);
    expect(body.not_found).toEqual(["76561197960265729"]);
    expect(body.unresolved).toEqual([{ input: "nobodyhere", error: expect.stringContaining("nobodyhere") }]);
    expect(body.resolved_from).toEqual({ "76561197960287930": "gabelogannewell" });

    const summaryCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("GetPlayerSummaries"));
    expect(summaryCalls).toHaveLength(1);
    expect(new URL(String(summaryCalls[0][0])).searchParams.get("steamids")).toBe(
      "76561197960287930,76561197960435530,76561197960265729",
    );
  });

  it("rejects both or neither of steamid and steamids", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    vi.stubGlobal("fetch", vi.fn());
    for (const args of [{}, { steamid: "76561197960435530", steamids: ["76561197960435530"] }]) {
      const result = await tool().handler(args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/either steamid .* or steamids/);
    }
  });

  it("fails the call on a systemic error instead of hiding it as unresolved", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })));
    const result = await tool().handler({ steamids: ["gabelogannewell"] });
    expect(result.isError).toBe(true);
  });
});
