import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";

const inputSchema = {
  steamid: z
    .string()
    .regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID")
    .describe("64-bit Steam ID of the player (e.g. 76561197960435530)"),
  include_played_free_games: z
    .boolean()
    .optional()
    .describe("Include free-to-play games in results (default: true)"),
  include_appinfo: z
    .boolean()
    .optional()
    .describe("Include game name and icon info (default: true)"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getOwnedGames",
    "Get a player's game library with playtime data. Shows all owned games, total playtime, and recent playtime. Requires STEAM_API_KEY.",
    inputSchema,
    async ({ steamid, include_played_free_games, include_appinfo }) => {
      try {
        const key = requireApiKey();
        const url = steamApiUrl("/IPlayerService/GetOwnedGames/v1/", {
          key,
          steamid,
          include_appinfo: include_appinfo !== false ? 1 : 0,
          include_played_free_games:
            include_played_free_games !== false ? 1 : 0,
          format: "json",
        });

        const data = (await steamFetch(url)) as {
          response?: {
            game_count?: number;
            games?: Array<Record<string, unknown>>;
          };
        };

        if (!data.response || !data.response.games) {
          return errorResponse(
            new Error(
              `Could not retrieve games for Steam ID ${steamid}. The profile may be private or the ID may be invalid.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  steamid,
                  game_count: data.response.game_count,
                  games: data.response.games,
                },
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
