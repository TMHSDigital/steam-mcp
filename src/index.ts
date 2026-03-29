#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { register as registerGetAppDetails } from "./tools/getAppDetails.js";
import { register as registerSearchApps } from "./tools/searchApps.js";
import { register as registerGetPlayerCount } from "./tools/getPlayerCount.js";
import { register as registerGetAchievementStats } from "./tools/getAchievementStats.js";
import { register as registerGetPlayerSummary } from "./tools/getPlayerSummary.js";
import { register as registerGetOwnedGames } from "./tools/getOwnedGames.js";
import { register as registerGetWorkshopItem } from "./tools/getWorkshopItem.js";
import { register as registerQueryWorkshop } from "./tools/queryWorkshop.js";
import { register as registerGetLeaderboardEntries } from "./tools/getLeaderboardEntries.js";
import { register as registerResolveVanityURL } from "./tools/resolveVanityURL.js";
import { register as registerCreateLobby } from "./tools/createLobby.js";
import { register as registerUploadWorkshopItem } from "./tools/uploadWorkshopItem.js";
import { register as registerUpdateWorkshopItem } from "./tools/updateWorkshopItem.js";
import { register as registerSetAchievement } from "./tools/setAchievement.js";
import { register as registerUploadLeaderboardScore } from "./tools/uploadLeaderboardScore.js";
import { register as registerGrantInventoryItem } from "./tools/grantInventoryItem.js";
import { register as registerGetReviews } from "./tools/getReviews.js";
import { register as registerGetPriceOverview } from "./tools/getPriceOverview.js";
import { register as registerGetAppReviewSummary } from "./tools/getAppReviewSummary.js";
import { register as registerGetRegionalPricing } from "./tools/getRegionalPricing.js";
import { register as registerClearAchievement } from "./tools/clearAchievement.js";
import { register as registerGetSchemaForGame } from "./tools/getSchemaForGame.js";
import { register as registerGetNewsForApp } from "./tools/getNewsForApp.js";
import { register as registerGetLeaderboardsForGame } from "./tools/getLeaderboardsForGame.js";
import { register as registerGetPlayerAchievements } from "./tools/getPlayerAchievements.js";

const server = new McpServer({
  name: "steam-mcp",
  version: "0.7.0",
});

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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
