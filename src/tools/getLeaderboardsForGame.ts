import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  getApiKey,
  errorResponse,
} from "../utils/steam-api.js";

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
    "List all leaderboards for a Steam app with their numeric IDs, names, and sort methods. Requires a free Steam Web API key (STEAM_API_KEY). No publisher access needed.",
    inputSchema,
    async ({ appid }) => {
      try {
        const key = getApiKey();
        const url = steamApiUrl(
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
                text: `No leaderboards found for app ${appid}. The app may not have leaderboards configured.`,
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
        return errorResponse(error);
      }
    },
  );
}
