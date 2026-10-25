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
    const fetchMock = vi.fn(() =>
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
