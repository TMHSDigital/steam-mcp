import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamApiUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID (e.g. 730 for Counter-Strike 2)"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getPlayerCount",
    "Get the current number of concurrent players for a Steam app. No API key required.",
    inputSchema,
    async ({ appid }) => {
      try {
        const url = steamApiUrl(
          "/ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
          { appid },
        );

        const data = (await steamFetch(url)) as {
          response?: { player_count?: number; result?: number };
        };

        if (
          !data.response ||
          data.response.result !== 1 ||
          data.response.player_count === undefined
        ) {
          return errorResponse(
            new Error(
              `No player count data available for app ${appid}. The app ID may be invalid.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  appid,
                  player_count: data.response.player_count,
                },
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
