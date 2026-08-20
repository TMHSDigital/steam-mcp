import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { STORE_ASSET_SLOTS } from "../storeAssets/slots.js";
import { validateStoreAsset } from "../storeAssets/validate.js";

const inputSchema = {
  path: z.string().min(1).describe("Local filesystem path to a PNG or JPEG"),
  slot: z
    .enum(STORE_ASSET_SLOTS)
    .describe(
      "Store or library asset slot (headerCapsule, smallCapsule, mainCapsule, verticalCapsule, libraryCapsule, libraryHero, libraryLogo, libraryHeader, screenshot, pageBackground)",
    ),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_validateStoreAsset",
    "Validate a local store or library image against current Valve pixel sizes, format rules, and library-hero heuristics. No API key required.",
    inputSchema,
    async ({ path, slot }) => {
      try {
        const result = validateStoreAsset(path, slot);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
