import { describe, it, expect, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { registeredTools } from "./harness.js";

// steam://server-info (#128) and the leaderboard steamid check.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function serverInfo(transport: "stdio" | "http") {
  const { server } = createServer(["store", "sdk"], transport);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const { contents } = await client.readResource({ uri: "steam://server-info" });
  await client.close();
  const first = contents[0];
  const text = "text" in first ? first.text : "";
  return { text, info: JSON.parse(text) };
}

describe("steam://server-info", () => {
  it("lists enabled and disabled toolsets and the HTTP opt-ins, without the key", async () => {
    vi.stubEnv("STEAM_API_KEY", "SECRETKEY_NOT_REAL");
    const { text, info } = await serverInfo("http");
    expect(info.transport).toBe("http");
    expect(info.enabled_toolsets).toEqual(["store", "sdk"]);
    expect(info.disabled_toolsets).toEqual(expect.arrayContaining(["community", "publisher", "mutations", "assets"]));
    expect(info.how_to_enable).toContain("STEAM_MCP_HTTP_ALLOW_WRITES");
    expect(info.api_key).toBe("set");
    expect(text).not.toContain("SECRETKEY_NOT_REAL");
  });

  it("uses the stdio wording and reports an unset key", async () => {
    vi.stubEnv("STEAM_API_KEY", "");
    const { info } = await serverInfo("stdio");
    expect(info.transport).toBe("stdio");
    expect(info.api_key).toBe("unset");
    expect(info.how_to_enable).toContain("STEAM_MCP_TOOLSETS");
    expect(info.how_to_enable).not.toContain("STEAM_MCP_HTTP_ALLOW_WRITES");
  });
});

describe("steam_getLeaderboardEntries steamid check", () => {
  const entries = registeredTools().get("steam_getLeaderboardEntries")!.handler;

  it.each([1, 2])("datarequest %i without steamid is refused before any request", async (datarequest) => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await entries({ appid: 480, leaderboardid: 1, datarequest });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("steamid is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
