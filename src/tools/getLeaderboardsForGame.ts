import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerUrl,
  steamFetch,
  requireApiKey,
  publisherErrorResponse,
} from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID to list leaderboards for"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getLeaderboardsForGame",
    {
      title: "Get Leaderboards For Game",
      description:
        "List all leaderboards for a Steam app with their numeric IDs, names, and sort methods. Use it to find the leaderboardid for steam_getLeaderboardEntries and steam_uploadLeaderboardScore. Requires a Steam Publisher API key (STEAM_API_KEY) for an app you own, with the server IP allowlisted. A regular user key gets HTTP 403.",
      inputSchema,
      annotations: READ_ONLY,
    },
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
        return publisherErrorResponse(error);
      }
    },
  );
}
