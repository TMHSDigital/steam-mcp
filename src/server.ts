import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerToolsets, TOOLSET_NAMES, type ToolsetName } from "./tools/index.js";
import { VERSION } from "./version.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";

export interface BuiltServer {
  server: McpServer;
  toolCount: number;
}

/** A fully registered server for the given toolsets. Shared by the stdio and HTTP entry points. */
export function createServer(enabled: readonly ToolsetName[], transport: "stdio" | "http"): BuiltServer {
  const server = new McpServer(
    {
      name: "steam-mcp",
      version: VERSION,
    },
    { capabilities: { logging: {} } },
  );

  const toolCount = registerToolsets(server, enabled);
  registerPrompts(server);
  registerResources(server);

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
            transport,
            enabled_toolsets: enabled,
            disabled_toolsets: TOOLSET_NAMES.filter((n) => !enabled.includes(n)),
            tool_count: toolCount,
            api_key: process.env.STEAM_API_KEY ? "set" : "unset",
            how_to_enable:
              transport === "http"
                ? "Set STEAM_MCP_TOOLSETS on the server. Live-mutation tools also need STEAM_MCP_HTTP_ALLOW_WRITES=1 in HTTP mode."
                : "Set STEAM_MCP_TOOLSETS (comma-separated, or all) in the server env. Live-mutation tools are in the mutations toolset.",
          }),
        },
      ],
    }),
  );

  return { server, toolCount };
}
