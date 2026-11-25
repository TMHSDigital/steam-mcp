import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { auditStoreAssetDir, REQUIRED_SLOTS, MIN_SCREENSHOTS } from "../storeAssets/audit.js";
import { LOCAL_ONLY } from "../utils/annotations.js";
import { STORE_ASSET_SLOTS } from "../storeAssets/slots.js";

const inputSchema = {
  dir: z.string().min(1).describe("Local folder containing the store and library images"),
  slots: z
    .record(z.string(), z.enum(STORE_ASSET_SLOTS))
    .optional()
    .describe(
      'Optional file name -> slot, for files whose name and size do not identify them, e.g. { "key_art_final.png": "libraryHero" }. Wins over inference (reported as inferred_by "explicit"); names not in the folder come back as warnings.',
    ),
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
    async ({ dir, slots }) => {
      try {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(auditStoreAssetDir(dir, slots)) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
