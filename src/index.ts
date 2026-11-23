#!/usr/bin/env node

import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { selectToolsets, TOOLSET_NAMES } from "./tools/index.js";
import { createServer } from "./server.js";
import { startHttpServer } from "./http.js";
import { VERSION } from "./version.js";
import { debug, debugEnabled, setMcpLogSink } from "./utils/log.js";

const { values: args } = parseArgs({
  options: {
    transport: { type: "string" },
    port: { type: "string" },
    host: { type: "string" },
    version: { type: "boolean" },
  },
});

if (args.version) {
  console.log(VERSION);
  process.exit(0);
}

const transport = (args.transport ?? process.env.STEAM_MCP_TRANSPORT ?? "stdio").toLowerCase();
if (transport !== "stdio" && transport !== "http") {
  console.error(`[steam-mcp] Unknown transport "${transport}". Use stdio or http.`);
  process.exit(1);
}

const selection = selectToolsets();
if (selection.unknown.length) {
  console.error(
    `[steam-mcp] Ignoring unknown STEAM_MCP_TOOLSETS entries: ${selection.unknown.join(", ")}. Valid: ${TOOLSET_NAMES.join(", ")}, all.`,
  );
}

const keyState = `STEAM_API_KEY ${process.env.STEAM_API_KEY ? "set" : "unset"}`;

async function main(): Promise<void> {
  if (transport === "http") {
    // A network-reachable server must not mutate live Steam state unless the
    // operator opts in separately from the toolset list.
    // The same applies to the assets toolset, which reads local files.
    const optIn = (name: string) => ["1", "true", "yes"].includes(process.env[name]?.toLowerCase() ?? "");
    const allowWrites = optIn("STEAM_MCP_HTTP_ALLOW_WRITES");
    const allowAssets = optIn("STEAM_MCP_HTTP_ALLOW_ASSETS");
    const enabled = selection.enabled.filter(
      (n) => (n !== "mutations" || allowWrites) && (n !== "assets" || allowAssets),
    );
    if (!allowWrites && selection.enabled.includes("mutations")) {
      console.error("[steam-mcp] HTTP mode: mutations toolset disabled. Set STEAM_MCP_HTTP_ALLOW_WRITES=1 to enable it.");
    }
    if (!allowAssets && selection.enabled.includes("assets")) {
      console.error("[steam-mcp] HTTP mode: assets toolset (local file reads) disabled. Set STEAM_MCP_HTTP_ALLOW_ASSETS=1 to enable it.");
    }
    const host = args.host ?? process.env.HOST ?? "127.0.0.1";
    const port = Number(args.port ?? process.env.PORT ?? 3000);
    const allowedHosts = (process.env.STEAM_MCP_ALLOWED_HOSTS ?? "localhost,127.0.0.1,[::1]")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    const token = process.env.STEAM_MCP_HTTP_TOKEN?.trim() || undefined;
    try {
      await startHttpServer({ host, port, enabled, allowedHosts, token });
    } catch (error) {
      console.error(`[steam-mcp] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
    const auth = token ? "bearer token required" : "no client auth, loopback only";
    console.error(`[steam-mcp] v${VERSION} listening on http://${host}:${port}/mcp (toolsets ${enabled.join(",")}, ${keyState}, ${auth})`);
    return;
  }

  const { server, toolCount } = createServer(selection.enabled, "stdio");
  await server.connect(new StdioServerTransport());
  if (debugEnabled()) {
    setMcpLogSink((line) => {
      server.sendLoggingMessage({ level: "debug", logger: "steam-mcp", data: line }).catch(() => {});
    });
  }
  debug(`v${VERSION} started: toolsets ${selection.enabled.join(",")} (${toolCount} tools), ${keyState}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
