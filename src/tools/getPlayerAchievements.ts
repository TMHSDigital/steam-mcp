import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
  steamDetailSuffix,
} from "../utils/steam-api.js";
import { SteamApiError, InvalidApiKeyError } from "../utils/errors.js";
import { READ_ONLY } from "../utils/annotations.js";

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
  server.registerTool(
    "steam_getPlayerAchievements",
    {
      title: "Get Player Achievements",
      description:
        "Get a specific player's achievement unlock status and timestamps for a Steam app. The player's profile must be public. Requires STEAM_API_KEY.",
      inputSchema,
      annotations: READ_ONLY,
    },
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
        // requireApiKey() already ran, so a 400/403 here is about the player
        // or app, not a missing key. An invalid key is reported by steamFetch.
        if (error instanceof SteamApiError && error.statusCode === 403 && !(error instanceof InvalidApiKeyError)) {
          return errorResponse(
            new Error(
              `Could not retrieve achievements for Steam ID ${steamid} on app ${appid}: the player's profile or game details are private.${steamDetailSuffix(error)}`,
            ),
          );
        }
        if (error instanceof SteamApiError && error.statusCode === 400) {
          return errorResponse(
            new Error(
              `Could not retrieve achievements for Steam ID ${steamid} on app ${appid}: the app has no stats, or the parameters are invalid.${steamDetailSuffix(error)}`,
            ),
          );
        }
        return errorResponse(error);
      }
    },
  );
}
