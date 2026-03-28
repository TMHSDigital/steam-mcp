import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID to get the achievement/stat schema for"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getSchemaForGame",
    "Get the achievement and stat schema for a Steam app. Returns achievement internal names, display names, descriptions, and icon URLs, plus stat definitions. Useful for mapping internal ACH_ names to human-readable names. Requires STEAM_API_KEY.",
    inputSchema,
    async ({ appid }) => {
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

        return {
          content: [
            { type: "text", text: JSON.stringify(data.game, null, 2) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
