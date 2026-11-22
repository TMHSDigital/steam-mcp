import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
  return rawWithBody(path, method, host, body).then((r) => r.status);
}

function rawWithBody(path: string, method: string, host: string, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { Host: host, "Content-Type": "application/json", Accept: "application/json, text/event-stream" } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
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

  it("answers an oversized body with 413 instead of resetting the connection (#87)", async () => {
    const res = await rawWithBody("/mcp", "POST", "localhost", "x".repeat(2 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body).error.code).toBe(-32600);
  });

  it("returns a JSON-RPC 500 when the transport throws (#87)", async () => {
    const spy = vi
      .spyOn(StreamableHTTPServerTransport.prototype, "handleRequest")
      .mockRejectedValueOnce(new Error("boom"));
    try {
      const res = await rawWithBody(
        "/mcp",
        "POST",
        "localhost",
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      );
      expect(res.status).toBe(500);
      expect(JSON.parse(res.body)).toMatchObject({ jsonrpc: "2.0", error: { code: -32603 } });
    } finally {
      spy.mockRestore();
    }
  });
});
