import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerGetAppDetails } from "./getAppDetails.js";
import { register as registerSearchApps } from "./searchApps.js";
import { register as registerGetPlayerCount } from "./getPlayerCount.js";
import { register as registerGetAchievementStats } from "./getAchievementStats.js";
import { register as registerGetPlayerSummary } from "./getPlayerSummary.js";
import { register as registerGetOwnedGames } from "./getOwnedGames.js";
import { register as registerGetWorkshopItem } from "./getWorkshopItem.js";
import { register as registerQueryWorkshop } from "./queryWorkshop.js";
import { register as registerGetLeaderboardEntries } from "./getLeaderboardEntries.js";
import { register as registerResolveVanityURL } from "./resolveVanityURL.js";
import { register as registerCreateLobby } from "./createLobby.js";
import { register as registerUploadWorkshopItem } from "./uploadWorkshopItem.js";
import { register as registerUpdateWorkshopItem } from "./updateWorkshopItem.js";
import { register as registerSetAchievement } from "./setAchievement.js";
import { register as registerUploadLeaderboardScore } from "./uploadLeaderboardScore.js";
import { register as registerGrantInventoryItem } from "./grantInventoryItem.js";
import { register as registerGetReviews } from "./getReviews.js";
import { register as registerGetPriceOverview } from "./getPriceOverview.js";
import { register as registerGetAppReviewSummary } from "./getAppReviewSummary.js";
import { register as registerGetRegionalPricing } from "./getRegionalPricing.js";
import { register as registerClearAchievement } from "./clearAchievement.js";
import { register as registerGetSchemaForGame } from "./getSchemaForGame.js";
import { register as registerGetNewsForApp } from "./getNewsForApp.js";
import { register as registerGetLeaderboardsForGame } from "./getLeaderboardsForGame.js";
import { register as registerGetPlayerAchievements } from "./getPlayerAchievements.js";
import { register as registerValidateStoreAsset } from "./validateStoreAsset.js";
import { register as registerValidateStoreAssetDir } from "./validateStoreAssetDir.js";
import { register as registerGetGlobalStatsForGame } from "./getGlobalStatsForGame.js";
import { register as registerGetDeckCompatibility } from "./getDeckCompatibility.js";
import { register as registerGetFeatured } from "./getFeatured.js";
import { register as registerCompareApps } from "./compareApps.js";
import { register as registerGetAppBetas } from "./getAppBetas.js";
import { register as registerGetAppBuilds } from "./getAppBuilds.js";
import { register as registerCheckAppOwnership } from "./checkAppOwnership.js";
import { register as registerGetInventory } from "./getInventory.js";
import { register as registerGetUserStatsForGame } from "./getUserStatsForGame.js";
import { register as registerGetPlayerBans } from "./getPlayerBans.js";

type Registrar = (server: McpServer) => void;

/**
 * Every default-bin tool, grouped so users can load only what they need
 * (STEAM_MCP_TOOLSETS). Partner-admin tools live in src/partner.
 */
export const TOOLSETS = {
  store: [
    registerGetAppDetails,
    registerSearchApps,
    registerGetPlayerCount,
    registerGetAchievementStats,
    registerGetPriceOverview,
    registerGetRegionalPricing,
    registerGetReviews,
    registerGetAppReviewSummary,
    registerGetNewsForApp,
    registerGetDeckCompatibility,
    registerGetFeatured,
    registerCompareApps,
  ],
  community: [
    registerGetPlayerSummary,
    registerGetOwnedGames,
    registerGetPlayerAchievements,
    registerResolveVanityURL,
    registerGetWorkshopItem,
    registerQueryWorkshop,
    registerGetUserStatsForGame,
    registerGetPlayerBans,
  ],
  publisher: [
    registerGetLeaderboardsForGame,
    registerGetLeaderboardEntries,
    registerGetSchemaForGame,
    registerGetGlobalStatsForGame,
    registerGetAppBetas,
    registerGetAppBuilds,
    registerCheckAppOwnership,
    registerGetInventory,
  ],
  mutations: [
    registerUpdateWorkshopItem,
    registerSetAchievement,
    registerClearAchievement,
    registerUploadLeaderboardScore,
    registerGrantInventoryItem,
  ],
  sdk: [registerCreateLobby, registerUploadWorkshopItem],
  assets: [registerValidateStoreAsset, registerValidateStoreAssetDir],
} satisfies Record<string, Registrar[]>;

export type ToolsetName = keyof typeof TOOLSETS;

export const TOOLSET_NAMES = Object.keys(TOOLSETS) as ToolsetName[];

/** Live-mutation tools are opt-in: STEAM_MCP_TOOLSETS=all or a list that names mutations. */
export const DEFAULT_TOOLSETS: ToolsetName[] = TOOLSET_NAMES.filter((n) => n !== "mutations");

export interface ToolsetSelection {
  enabled: ToolsetName[];
  /** Names in the env var that are not toolsets. */
  unknown: string[];
}

/** Parse STEAM_MCP_TOOLSETS and STEAM_MCP_READ_ONLY. */
export function selectToolsets(env: NodeJS.ProcessEnv = process.env): ToolsetSelection {
  const raw = env.STEAM_MCP_TOOLSETS?.trim();
  const requested = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_TOOLSETS;
  const unknown = requested.filter((n) => n !== "all" && !(n in TOOLSETS));
  let enabled = requested.includes("all")
    ? [...TOOLSET_NAMES]
    : TOOLSET_NAMES.filter((n) => requested.includes(n));
  const readOnly = ["1", "true", "yes"].includes(env.STEAM_MCP_READ_ONLY?.trim().toLowerCase() ?? "");
  if (readOnly) {
    enabled = enabled.filter((n) => n !== "mutations");
  }
  return { enabled, unknown };
}

/** Registers the tools in `toolsets` and returns how many were registered. */
export function registerToolsets(server: McpServer, toolsets: readonly ToolsetName[]): number {
  let count = 0;
  for (const name of toolsets) {
    for (const register of TOOLSETS[name]) {
      register(server);
      count++;
    }
  }
  return count;
}

/** Registers every default-bin tool (all toolsets) and returns how many were registered. */
export function registerAllTools(server: McpServer): number {
  return registerToolsets(server, TOOLSET_NAMES);
}
