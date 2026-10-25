import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID to get the achievement/stat schema for"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe("Maximum achievements to return (default: 100). achievement_count always reports the total."),
  include_stats: z
    .boolean()
    .optional()
    .describe("Include stat definitions (default: true)"),
  include_icons: z
    .boolean()
    .optional()
    .describe("Include achievement icon URLs (default: false)"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getSchemaForGame",
    {
      title: "Get Schema For Game",
      description:
        "Get the achievement and stat schema for a Steam app: achievement internal names, display names, descriptions, and hidden flags, plus stat definitions. Useful for mapping internal ACH_ names to human-readable names. Returns up to 100 achievements without icon URLs by default (see limit, include_icons, include_stats). Requires STEAM_API_KEY.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid, limit, include_stats, include_icons }) => {
      try {
        const key = requireApiKey();
        const url = steamApiUrl(
          "/ISteamUserStats/GetSchemaForGame/v2/",
          { key, appid },
        );

        const data = (await steamFetch(url)) as {
          game?: {
            gameName?: string;
            availableGameStats?: {
              achievements?: Array<Record<string, unknown>>;
              stats?: Array<Record<string, unknown>>;
            };
          };
        };

        if (!data.game) {
          return errorResponse(
            new Error(
              `No schema found for app ${appid}. The app may not exist or may not have achievements/stats configured.`,
            ),
          );
        }

        const achievements = data.game.availableGameStats?.achievements ?? [];
        const stats = data.game.availableGameStats?.stats ?? [];
        const shown = achievements.slice(0, limit ?? 100).map((a) => {
          if (include_icons) return a;
          const { icon: _icon, icongray: _icongray, ...rest } = a;
          return rest;
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                appid,
                gameName: data.game.gameName,
                achievement_count: achievements.length,
                stat_count: stats.length,
                achievements: shown,
                ...(include_stats === false ? {} : { stats }),
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
