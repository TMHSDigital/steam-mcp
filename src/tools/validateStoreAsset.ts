import { statSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { STORE_ASSET_SLOTS } from "../storeAssets/slots.js";
import { validateStoreAsset, validateAchievementIconDir } from "../storeAssets/validate.js";
import { LOCAL_ONLY } from "../utils/annotations.js";

const inputSchema = {
  path: z
    .string()
    .min(1)
    .describe(
      "Local path to a PNG or JPEG. For slot achievementIcon, may also be a directory: every image is checked and each <name>_achieved needs a <name>_unachieved.",
    ),
  slot: z
    .enum(STORE_ASSET_SLOTS)
    .describe(
      "Asset slot: store capsules (headerCapsule, smallCapsule, mainCapsule, verticalCapsule), library (libraryCapsule, libraryHero, libraryLogo, libraryHeader), screenshot, pageBackground, achievementIcon (256x256 JPG), communityIcon (184x184 JPG), eventCover (800x450), eventHeader (1920x622)",
    ),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_validateStoreAsset",
    {
      title: "Validate Store Asset",
      description:
        "Validate a local store, library, achievement, community, or event image against Valve's pixel sizes, format rules, and library-hero heuristics. Pass a directory with slot achievementIcon to check a whole achievement icon set, including missing achieved/unachieved pairs. No API key required.",
      inputSchema,
      annotations: LOCAL_ONLY,
    },
    async ({ path, slot }) => {
      try {
        let isDirectory = false;
        try {
          isDirectory = statSync(path).isDirectory();
        } catch {
          // Missing paths fall through to validateStoreAsset, which reports IO.
        }
        if (isDirectory && slot !== "achievementIcon") {
          return errorResponse(
            new Error(`${path} is a directory. Only slot achievementIcon accepts a directory.`),
          );
        }
        const result = isDirectory ? validateAchievementIconDir(path) : validateStoreAsset(path, slot);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
