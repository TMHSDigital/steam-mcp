import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHttpServer } from "../../http.js";

let server: Server;
let port: number;

beforeAll(async () => {
  server = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    enabled: ["sdk", "assets"],
    allowedHosts: ["localhost", "127.0.0.1"],
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

/** Raw request so the Host header can be forged (fetch forbids setting it). */
function raw(path: string, method: string, host: string, body?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { Host: host, "Content-Type": "application/json", Accept: "application/json, text/event-stream" } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end(body);
  });
}

describe("HTTP transport", () => {
  it("serves MCP over POST /mcp with only the enabled toolsets", async () => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "steam_createLobby",
      "steam_uploadWorkshopItem",
      "steam_validateStoreAsset",
      "steam_validateStoreAssetDir",
    ]);
    const result = await client.callTool({ name: "steam_createLobby", arguments: { type: "public", max_members: 4 } });
    expect(JSON.stringify(result.content)).toContain("CreateLobby");
    await client.close();
  });

  it("rejects a foreign Host header (DNS rebinding)", async () => {
    expect(await raw("/mcp", "POST", "evil.example", "{}")).toBe(403);
    expect(await raw("/healthz", "GET", `127.0.0.1:${port}`)).toBe(200);
  });

  it("only accepts POST on /mcp and 404s other paths", async () => {
    expect(await raw("/mcp", "GET", "localhost")).toBe(405);
    expect(await raw("/other", "GET", "localhost")).toBe(404);
    expect(await raw("/mcp", "POST", "localhost", "{not json")).toBe(400);
  });
});
