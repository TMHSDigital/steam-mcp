#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAllTools } from "./tools/index.js";
import { VERSION } from "./version.js";
import { debug, debugEnabled, setMcpLogSink } from "./utils/log.js";

const server = new McpServer(
  {
    name: "steam-mcp",
    version: VERSION,
  },
  { capabilities: { logging: {} } },
);

const toolCount = registerAllTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (debugEnabled()) {
    setMcpLogSink((line) => {
      server.sendLoggingMessage({ level: "debug", logger: "steam-mcp", data: line }).catch(() => {});
    });
  }
  debug(
    `v${VERSION} started: ${toolCount} tools, STEAM_API_KEY ${process.env.STEAM_API_KEY ? "set" : "unset"}`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
