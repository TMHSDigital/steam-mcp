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
  include_played_free_games: z
    .boolean()
    .optional()
    .describe("Include free-to-play games in results (default: true)"),
  include_appinfo: z
    .boolean()
    .optional()
    .describe("Include game name and icon info (default: true)"),
  sort: z
    .enum(["playtime", "recent", "name"])
    .optional()
    .describe("Order games by total playtime (default), playtime in the last two weeks, or name"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .optional()
    .describe("Maximum games to return after sorting (default: 50). game_count always reports the full library."),
  appids: z
    .array(z.number().int().positive())
    .optional()
    .describe("Only return these apps, e.g. to check whether the player owns them"),
};

type OwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  [key: string]: unknown;
};

const SORTERS: Record<"playtime" | "recent" | "name", (a: OwnedGame, b: OwnedGame) => number> = {
  playtime: (a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0),
  recent: (a, b) => (b.playtime_2weeks ?? 0) - (a.playtime_2weeks ?? 0),
  name: (a, b) => (a.name ?? "").localeCompare(b.name ?? ""),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getOwnedGames",
    {
      title: "Get Owned Games",
      description:
        "Get a player's game library with playtime data. Returns the library size and total playtime, plus the top 50 games by playtime by default (change with sort and limit, or filter with appids). Requires STEAM_API_KEY.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ steamid: player, include_played_free_games, include_appinfo, sort, limit, appids }) => {
      let steamid = player;
      let resolvedFrom: string | undefined;
      try {
        const key = requireApiKey();
        ({ steamid, resolved_from: resolvedFrom } = await resolveSteamId(player));
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
            games?: OwnedGame[];
          };
        };

        if (!data.response || !data.response.games) {
          return errorResponse(
            new Error(
              `Could not retrieve games for Steam ID ${steamid}. The profile may be private or the ID may be invalid.`,
            ),
          );
        }

        const all = data.response.games;
        const wanted = appids?.length ? new Set(appids) : undefined;
        const games = (wanted ? all.filter((g) => wanted.has(g.appid)) : [...all])
          .sort(SORTERS[sort ?? "playtime"])
          .slice(0, limit ?? 50);
        const totalPlaytime = all.reduce((sum, g) => sum + (g.playtime_forever ?? 0), 0);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                steamid,
                ...(resolvedFrom ? { resolved_from: resolvedFrom } : {}),
                game_count: data.response.game_count ?? all.length,
                total_playtime_minutes: totalPlaytime,
                returned: games.length,
                sort: sort ?? "playtime",
                games,
              }),
            },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
