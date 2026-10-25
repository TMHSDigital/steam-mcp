#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerToolsets, selectToolsets, TOOLSET_NAMES } from "./tools/index.js";
import { VERSION } from "./version.js";
import { debug, debugEnabled, setMcpLogSink } from "./utils/log.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";

const server = new McpServer(
  {
    name: "steam-mcp",
    version: VERSION,
  },
  { capabilities: { logging: {} } },
);

const { enabled, unknown } = selectToolsets();
const toolCount = registerToolsets(server, enabled);
registerPrompts(server);
registerResources(server);

if (unknown.length) {
  console.error(
    `[steam-mcp] Ignoring unknown STEAM_MCP_TOOLSETS entries: ${unknown.join(", ")}. Valid: ${TOOLSET_NAMES.join(", ")}, all.`,
  );
}

server.registerResource(
  "server-info",
  "steam://server-info",
  {
    title: "Steam MCP server info",
    description: "Version, enabled toolsets, and how to enable the rest. Read this when a Steam tool you expect is missing.",
    mimeType: "application/json",
  },
  (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          version: VERSION,
          enabled_toolsets: enabled,
          disabled_toolsets: TOOLSET_NAMES.filter((n) => !enabled.includes(n)),
          tool_count: toolCount,
          api_key: process.env.STEAM_API_KEY ? "set" : "unset",
          how_to_enable: "Set STEAM_MCP_TOOLSETS (comma-separated, or all) in the server env. Live-mutation tools are in the mutations toolset.",
        }),
      },
    ],
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (debugEnabled()) {
    setMcpLogSink((line) => {
      server.sendLoggingMessage({ level: "debug", logger: "steam-mcp", data: line }).catch(() => {});
    });
  }
  debug(
    `v${VERSION} started: toolsets ${enabled.join(",")} (${toolCount} tools), STEAM_API_KEY ${process.env.STEAM_API_KEY ? "set" : "unset"}`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
