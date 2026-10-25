import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamApiUrl, steamFetch, requireApiKey, errorResponse, steamDetailSuffix } from "../utils/steam-api.js";
import { SteamApiError, InvalidApiKeyError } from "../utils/errors.js";
import { READ_ONLY } from "../utils/annotations.js";
import { steamIdInput, resolveSteamId } from "../utils/steamid.js";

const inputSchema = {
  steamid: steamIdInput,
  appid: z.number().int().positive().describe("Steam application ID"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getUserStatsForGame",
    {
      title: "Get User Stats For Game",
      description:
        "Get a player's stat values and unlocked achievements for an app, for debugging stats alongside the achievement tools. The player's game details must be public. Requires STEAM_API_KEY.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ steamid: player, appid }) => {
      let steamid = player;
      try {
        const key = requireApiKey();
        let resolved_from: string | undefined;
        ({ steamid, resolved_from } = await resolveSteamId(player));
        const data = (await steamFetch(
          steamApiUrl("/ISteamUserStats/GetUserStatsForGame/v2/", { key, steamid, appid }),
        )) as { playerstats?: { gameName?: string; stats?: unknown[]; achievements?: unknown[] } };

        const p = data.playerstats;
        if (!p) {
          return errorResponse(new Error(`No stats for ${steamid} on app ${appid}.`));
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                steamid,
                appid,
                ...(resolved_from ? { resolved_from } : {}),
                gameName: p.gameName,
                stats: p.stats ?? [],
                achievements: p.achievements ?? [],
              }),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SteamApiError && error.statusCode === 403 && !(error instanceof InvalidApiKeyError)) {
          return errorResponse(
            new Error(`Stats for ${steamid} on app ${appid} are private.${steamDetailSuffix(error)}`),
          );
        }
        if (error instanceof SteamApiError && error.statusCode === 400) {
          return errorResponse(
            new Error(`App ${appid} has no stats for ${steamid}, or the player has never played it.${steamDetailSuffix(error)}`),
          );
        }
        return errorResponse(error);
      }
    },
  );
}
