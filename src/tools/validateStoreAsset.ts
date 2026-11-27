import { kindOf } from "../storeAssets/safePath.js";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { STORE_ASSET_SLOTS, SLOT_SPECS, type StoreAssetSlot } from "../storeAssets/slots.js";

/** "WxH" from store-specs.json, the only place slot sizes live. */
const sizeOf = (slot: StoreAssetSlot) => `${SLOT_SPECS[slot].width}x${SLOT_SPECS[slot].height}`;
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
      `Asset slot: store capsules (headerCapsule, smallCapsule, mainCapsule, verticalCapsule), library (libraryCapsule, libraryHero, libraryLogo, libraryHeader), screenshot, pageBackground, achievementIcon (${sizeOf("achievementIcon")} JPG), communityIcon (${sizeOf("communityIcon")} JPG), eventCover (${sizeOf("eventCover")}), eventHeader (${sizeOf("eventHeader")})`,
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
        // kindOf rejects network and device paths before touching the disk.
        // Missing paths fall through to validateStoreAsset, which reports IO.
        const isDirectory = kindOf(path) === "directory";
        if (isDirectory && slot !== "achievementIcon") {
          return errorResponse(
            new Error(`${path} is a directory. Only slot achievementIcon accepts a directory.`),
          );
        }
        const result = isDirectory ? validateAchievementIconDir(path) : validateStoreAsset(path, slot);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
