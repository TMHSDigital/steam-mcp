import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireApiKey, publisherErrorResponse } from "../utils/steam-api.js";
import { fetchLeaderboards } from "../utils/leaderboards.js";
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
        "List all leaderboards for a Steam app with their numeric IDs, names, and sort methods. steam_getLeaderboardEntries and steam_uploadLeaderboardScore accept either the leaderboardid or the leaderboard_name; use this tool to see which leaderboards exist. Requires a Steam Publisher API key (STEAM_API_KEY) for an app you own, with the server IP allowlisted. A regular user key gets HTTP 403.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid }) => {
      try {
        const key = requireApiKey();
        const leaderboards = await fetchLeaderboards(appid, key);

        if (leaderboards.length === 0) {
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
                { appid, count: leaderboards.length, leaderboards }
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
