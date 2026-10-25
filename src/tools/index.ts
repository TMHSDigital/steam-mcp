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

/** Every default-bin tool. Partner-admin tools live in src/partner. */
const REGISTRARS: Array<(server: McpServer) => void> = [
  registerGetAppDetails,
  registerSearchApps,
  registerGetPlayerCount,
  registerGetAchievementStats,
  registerGetPlayerSummary,
  registerGetOwnedGames,
  registerGetWorkshopItem,
  registerQueryWorkshop,
  registerGetLeaderboardEntries,
  registerResolveVanityURL,
  registerCreateLobby,
  registerUploadWorkshopItem,
  registerUpdateWorkshopItem,
  registerSetAchievement,
  registerUploadLeaderboardScore,
  registerGrantInventoryItem,
  registerGetReviews,
  registerGetPriceOverview,
  registerGetAppReviewSummary,
  registerGetRegionalPricing,
  registerClearAchievement,
  registerGetSchemaForGame,
  registerGetNewsForApp,
  registerGetLeaderboardsForGame,
  registerGetPlayerAchievements,
  registerValidateStoreAsset,
];

/** Registers every default-bin tool and returns how many were registered. */
export function registerAllTools(server: McpServer): number {
  for (const register of REGISTRARS) register(server);
  return REGISTRARS.length;
}
