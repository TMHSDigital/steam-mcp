import { createHash, timingSafeEqual } from "node:crypto";
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
  /**
   * Host header values to accept. This guards a localhost server against DNS
   * rebinding; it is not access control. Browser Origin headers are checked
   * against the same list.
   */
  allowedHosts: string[];
  /** Bearer token every /mcp request must carry. Required on a non-loopback host. */
  token?: string;
}

export const MIN_TOKEN_LENGTH = 16;

/** True for addresses only this machine can reach. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/**
 * Why the server must not start with these options, or undefined if it may.
 * A server other machines can reach must authenticate its clients.
 */
export function httpStartupProblem(host: string, token: string | undefined): string | undefined {
  if (token !== undefined && token.length < MIN_TOKEN_LENGTH) {
    return `STEAM_MCP_HTTP_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`;
  }
  if (!token && !isLoopbackHost(host)) {
    return `Refusing to listen on ${host} without STEAM_MCP_HTTP_TOKEN. Other machines could call every loaded tool with this server's Steam keys. Set a token, or bind to 127.0.0.1.`;
  }
  return undefined;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

function tokenMatches(header: string | undefined, token: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  // Hash both sides so the comparison is constant-time whatever the lengths.
  return !!match && timingSafeEqual(digest(match[1].trim()), digest(token));
}

const MAX_BODY_BYTES = 1024 * 1024;

class BodyTooLargeError extends Error {}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering and discard the rest, so the 413 reaches the client.
        // Destroying the request here reset the connection instead.
        req.removeAllListeners("data");
        req.resume();
        reject(new BodyTooLargeError());
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

/** Requests from a web page carry Origin; MCP clients outside a browser usually do not. */
function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (origin === undefined) return true;
  try {
    return hostAllowed(new URL(origin).host, allowed);
  } catch {
    return false;
  }
}

export function startHttpServer(options: HttpOptions): Promise<Server> {
  const problem = httpStartupProblem(options.host, options.token);
  if (problem) return Promise.reject(new Error(problem));

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
    if (!originAllowed(req.headers.origin, options.allowedHosts)) {
      json(403, { error: "Origin not allowed. Set STEAM_MCP_ALLOWED_HOSTS to accept it." });
      return;
    }
    if (options.token && !tokenMatches(req.headers.authorization, options.token)) {
      res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
      res.end(JSON.stringify({ error: "Missing or wrong bearer token." }));
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
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        // Close the connection after replying; a client that keeps
        // streaming is cut off after a few seconds.
        res.setHeader("Connection", "close");
        res.on("finish", () => setTimeout(() => req.destroy(), 5_000).unref());
        json(413, {
          jsonrpc: "2.0",
          error: { code: -32600, message: `Request body over ${MAX_BODY_BYTES} bytes` },
          id: null,
        });
        return;
      }
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
