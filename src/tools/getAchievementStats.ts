import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamApiUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID to get achievement stats for"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getAchievementStats",
    "Get global achievement unlock percentages for a Steam app. Shows how many players have unlocked each achievement. No API key required.",
    inputSchema,
    async ({ appid }) => {
      try {
        const url = steamApiUrl(
          "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
          { gameid: appid },
        );

        const data = (await steamFetch(url)) as {
          achievementpercentages?: {
            achievements?: Array<{ name: string; percent: number }>;
          };
        };

        const achievements =
          data.achievementpercentages?.achievements;

        if (!achievements || achievements.length === 0) {
          return errorResponse(
            new Error(
              `No achievement data found for app ${appid}. The app may not have achievements or the ID may be invalid.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { appid, achievements },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
