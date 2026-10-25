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

/** Registers every default-bin tool. Partner-admin tools live in src/partner. */
export function registerAllTools(server: McpServer): void {
  registerGetAppDetails(server);
  registerSearchApps(server);
  registerGetPlayerCount(server);
  registerGetAchievementStats(server);
  registerGetPlayerSummary(server);
  registerGetOwnedGames(server);
  registerGetWorkshopItem(server);
  registerQueryWorkshop(server);
  registerGetLeaderboardEntries(server);
  registerResolveVanityURL(server);
  registerCreateLobby(server);
  registerUploadWorkshopItem(server);
  registerUpdateWorkshopItem(server);
  registerSetAchievement(server);
  registerUploadLeaderboardScore(server);
  registerGrantInventoryItem(server);
  registerGetReviews(server);
  registerGetPriceOverview(server);
  registerGetAppReviewSummary(server);
  registerGetRegionalPricing(server);
  registerClearAchievement(server);
  registerGetSchemaForGame(server);
  registerGetNewsForApp(server);
  registerGetLeaderboardsForGame(server);
  registerGetPlayerAchievements(server);
  registerValidateStoreAsset(server);
}
