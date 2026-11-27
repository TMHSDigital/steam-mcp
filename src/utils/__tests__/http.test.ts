import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  startHttpServer,
  httpStartupProblem,
  isLoopbackHost,
  httpToolsets,
  allowedHostsFromEnv,
  httpTokenFromEnv,
} from "../../http.js";
import { TOOLSET_NAMES } from "../../tools/index.js";

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

function rawWithBody(
  path: string,
  method: string,
  host: string,
  body?: string,
  extra: Record<string, string> = {},
  toPort = port,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers = { Host: host, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...extra };
    const req = request({ host: "127.0.0.1", port: toPort, path, method, headers }, (res) => {
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

  it("rejects a request from a web page on a foreign origin", async () => {
    const list = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect((await rawWithBody("/mcp", "POST", "localhost", list, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await rawWithBody("/mcp", "POST", "localhost", list, { Origin: "http://localhost:5173" })).status).toBe(200);
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

describe("HTTP client authentication", () => {
  const token = "test-token-0123456789abcdef";
  const list = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  let authed: Server;
  let authedPort: number;

  beforeAll(async () => {
    authed = await startHttpServer({ host: "127.0.0.1", port: 0, enabled: ["sdk"], allowedHosts: ["localhost", "127.0.0.1"], token });
    authedPort = (authed.address() as AddressInfo).port;
  });
  afterAll(() => {
    authed.close();
  });

  it("requires the bearer token on /mcp when one is set", async () => {
    const send = (extra: Record<string, string>) =>
      rawWithBody("/mcp", "POST", "localhost", list, extra, authedPort).then((r) => r.status);
    expect(await send({})).toBe(401);
    expect(await send({ Authorization: "Bearer wrong-token-0123456789" })).toBe(401);
    expect(await send({ Authorization: `Basic ${token}` })).toBe(401);
    expect(await send({ Authorization: `Bearer ${token}` })).toBe(200);
    // The health check stays open for container probes.
    expect((await rawWithBody("/healthz", "GET", "localhost", undefined, {}, authedPort)).status).toBe(200);
  });

  it("works with the SDK client when it sends the token", async () => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${authedPort}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    expect((await client.listTools()).tools.length).toBe(2);
    await client.close();
  });

  it("refuses to listen beyond loopback without a token", async () => {
    await expect(
      startHttpServer({ host: "0.0.0.0", port: 0, enabled: ["sdk"], allowedHosts: ["localhost"] }),
    ).rejects.toThrow(/STEAM_MCP_HTTP_TOKEN/);
    expect(httpStartupProblem("0.0.0.0", undefined)).toMatch(/Refusing/);
    expect(httpStartupProblem("192.168.1.5", undefined)).toMatch(/Refusing/);
    expect(httpStartupProblem("0.0.0.0", "short")).toMatch(/at least 16/);
    expect(httpStartupProblem("0.0.0.0", token)).toBeUndefined();
    expect(httpStartupProblem("127.0.0.1", undefined)).toBeUndefined();
  });

  it("knows which hosts are loopback", () => {
    for (const h of ["127.0.0.1", "127.1.2.3", "localhost", "::1", "[::1]"]) expect(isLoopbackHost(h), h).toBe(true);
    for (const h of ["0.0.0.0", "::", "192.168.1.5", "example.com", "127.0.0.1.evil.com"]) expect(isLoopbackHost(h), h).toBe(false);
  });
});

// #113: the HTTP-mode safety defaults, as pure functions index.ts calls.
describe("httpToolsets", () => {
  const all = [...TOOLSET_NAMES];

  it("drops mutations and assets by default, with a notice for each", () => {
    const { enabled, notices } = httpToolsets(all, {});
    expect(enabled).not.toContain("mutations");
    expect(enabled).not.toContain("assets");
    expect(enabled).toContain("store");
    expect(notices).toHaveLength(2);
  });

  it.each([
    ["STEAM_MCP_HTTP_ALLOW_WRITES", "mutations"],
    ["STEAM_MCP_HTTP_ALLOW_ASSETS", "assets"],
  ] as const)("%s opts %s in", (name, toolset) => {
    for (const value of ["1", "true", "YES"]) {
      expect(httpToolsets(all, { [name]: value }).enabled, value).toContain(toolset);
    }
    for (const value of ["0", "on", ""]) {
      expect(httpToolsets(all, { [name]: value }).enabled, value).not.toContain(toolset);
    }
  });

  it("says nothing about toolsets that were not selected", () => {
    expect(httpToolsets(["store"], {}).notices).toEqual([]);
  });
});

describe("HTTP env parsing", () => {
  it("normalizes STEAM_MCP_ALLOWED_HOSTS", () => {
    expect(allowedHostsFromEnv({ STEAM_MCP_ALLOWED_HOSTS: " Example.COM ,,localhost" })).toEqual(["example.com", "localhost"]);
    expect(allowedHostsFromEnv({})).toEqual(["localhost", "127.0.0.1", "[::1]"]);
  });

  it("treats a token of only spaces as unset", () => {
    expect(httpTokenFromEnv({ STEAM_MCP_HTTP_TOKEN: "   " })).toBeUndefined();
    expect(httpTokenFromEnv({ STEAM_MCP_HTTP_TOKEN: " abc " })).toBe("abc");
  });
});
