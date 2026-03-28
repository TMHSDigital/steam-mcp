import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";
import { SteamApiError } from "../utils/errors.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID to list leaderboards for"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getLeaderboardsForGame",
    "List all leaderboards for a Steam app, including their numeric IDs, names, sort methods, and display types. Use this to discover leaderboard IDs for steam_getLeaderboardEntries. This is a partner API endpoint - requires a publisher API key with server IP allowlisted in Steamworks.",
    inputSchema,
    async ({ appid }) => {
      try {
        const key = requireApiKey();
        const url = steamPartnerUrl(
          "/ISteamLeaderboards/GetLeaderboardsForGame/v2/",
          { key, appid },
        );

        const data = (await steamFetch(url)) as {
          response?: {
            leaderboards?: Array<Record<string, unknown>>;
          };
        };

        const leaderboards = data.response?.leaderboards;

        if (!leaderboards || leaderboards.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No leaderboards found for app ${appid}. The app may not have leaderboards configured, or the API key may lack publisher access.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { appid, count: leaderboards.length, leaderboards },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SteamApiError && (error.statusCode === 400 || error.statusCode === 403)) {
          return errorResponse(
            new Error(
              `HTTP ${error.statusCode} - This tool requires a Steam Publisher API key with the server's IP allowlisted in your Steamworks partner settings. Set STEAM_API_KEY to a publisher key and add the server IP to your Web API key's allowed IP list at https://partner.steamgames.com/doc/webapi_overview/auth`,
            ),
          );
        }
        return errorResponse(error);
      }
    },
  );
}
