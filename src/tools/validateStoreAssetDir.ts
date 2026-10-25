import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { auditStoreAssetDir, REQUIRED_SLOTS, MIN_SCREENSHOTS } from "../storeAssets/audit.js";
import { LOCAL_ONLY } from "../utils/annotations.js";

const inputSchema = {
  dir: z.string().min(1).describe("Local folder containing the store and library images"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_validateStoreAssetDir",
    {
      title: "Validate Store Asset Folder",
      description: `Audit a folder of store art before launch. Infers each image's slot from its file name (hero, logo, header, small, main, vertical, library, screenshot, ...) or its exact size, validates it, and lists missing required slots (${REQUIRED_SLOTS.join(", ")}) and whether there are at least ${MIN_SCREENSHOTS} valid screenshots. No API key required.`,
      inputSchema,
      annotations: LOCAL_ONLY,
    },
    async ({ dir }) => {
      try {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(auditStoreAssetDir(dir)) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
