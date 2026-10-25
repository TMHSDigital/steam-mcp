import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createServer } from "./server.js";
import type { ToolsetName } from "./tools/index.js";
import { debug } from "./utils/log.js";

// Stateless Streamable HTTP: every POST /mcp gets a fresh server and
// transport, so no session state is held. The Steam key stays in the server's
// environment; nothing a client sends can supply or change it.

export interface HttpOptions {
  host: string;
  port: number;
  enabled: readonly ToolsetName[];
  /** Host header values to accept. Guards a localhost server against DNS rebinding. */
  allowedHosts: string[];
}

const MAX_BODY_BYTES = 1024 * 1024;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function hostAllowed(header: string | undefined, allowed: string[]): boolean {
  if (allowed.includes("*")) return true;
  const host = (header ?? "").replace(/:\d+$/, "").toLowerCase();
  return allowed.includes(host);
}

export function startHttpServer(options: HttpOptions): Promise<Server> {
  const http = createHttpServer(async (req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    };

    if (!hostAllowed(req.headers.host, options.allowedHosts)) {
      json(403, { error: "Host not allowed. Set STEAM_MCP_ALLOWED_HOSTS to accept it." });
      return;
    }

    const path = (req.url ?? "/").split("?")[0];
    if (path === "/healthz") {
      json(200, { ok: true });
      return;
    }
    if (path !== "/mcp") {
      json(404, { error: "Not found. The MCP endpoint is /mcp." });
      return;
    }
    if (req.method !== "POST") {
      // Stateless mode has no server-initiated stream or session to delete.
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch {
      json(400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
      return;
    }

    const { server } = createServer(options.enabled, "http");
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      debug(`HTTP request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        json(500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  });

  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, options.host, () => resolve(http));
  });
}
