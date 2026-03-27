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
};

export function register(server: McpServer): void {
  server.tool(
    "steam.getPlayerSummary",
    "Get a player's Steam profile including display name, avatar, online status, and profile visibility. Requires STEAM_API_KEY.",
    inputSchema,
    async ({ steamid }) => {
      try {
        const key = requireApiKey();
        const url = steamApiUrl("/ISteamUser/GetPlayerSummaries/v2/", {
          key,
          steamids: steamid,
        });

        const data = (await steamFetch(url)) as {
          response?: { players?: Array<Record<string, unknown>> };
        };

        const players = data.response?.players;
        if (!players || players.length === 0) {
          return errorResponse(
            new Error(
              `No player found with Steam ID ${steamid}. The profile may be private or the ID may be invalid.`,
            ),
          );
        }

        return {
          content: [
            { type: "text", text: JSON.stringify(players[0], null, 2) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
