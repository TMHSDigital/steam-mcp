import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import { steamIdInput, resolveSteamId } from "../utils/steamid.js";

const inputSchema = {
  steamid: steamIdInput,
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getPlayerSummary",
    {
      title: "Get Player Summary",
      description:
        "Get a player's Steam profile including display name, avatar, online status, and profile visibility. Requires STEAM_API_KEY.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ steamid: player }) => {
      let steamid = player;
      let resolvedFrom: string | undefined;
      try {
        const key = requireApiKey();
        ({ steamid, resolved_from: resolvedFrom } = await resolveSteamId(player));
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
            { type: "text", text: JSON.stringify({ ...players[0], ...(resolvedFrom ? { resolved_from: resolvedFrom } : {}) }, null, 2) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
