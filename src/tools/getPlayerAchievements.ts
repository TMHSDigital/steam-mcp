import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";
import { SteamApiError } from "../utils/errors.js";

const inputSchema = {
  steamid: z
    .string()
    .regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID")
    .describe("64-bit Steam ID of the player"),
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID to get achievements for"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getPlayerAchievements",
    "Get a specific player's achievement unlock status and timestamps for a Steam app. The player's profile must be public. Requires STEAM_API_KEY.",
    inputSchema,
    async ({ steamid, appid }) => {
      try {
        const key = requireApiKey();
        const url = steamApiUrl(
          "/ISteamUserStats/GetPlayerAchievements/v1/",
          { key, steamid, appid },
        );

        const data = (await steamFetch(url)) as {
          playerstats?: {
            steamID?: string;
            gameName?: string;
            success?: boolean;
            achievements?: Array<Record<string, unknown>>;
          };
        };

        if (!data.playerstats?.success) {
          return errorResponse(
            new Error(
              `Could not retrieve achievements for Steam ID ${steamid} on app ${appid}. The player's profile may be private, or the app may not have achievements.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.playerstats, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SteamApiError && (error.statusCode === 403 || error.statusCode === 400)) {
          return errorResponse(
            new Error(
              `Could not retrieve achievements for Steam ID ${steamid}. This tool requires a free Steam Web API key (set STEAM_API_KEY). The player's game details and profile must be public. Get a key at https://steamcommunity.com/dev/apikey`,
            ),
          );
        }
        return errorResponse(error);
      }
    },
  );
}
