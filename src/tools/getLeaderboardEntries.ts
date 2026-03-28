import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
  leaderboardid: z
    .number()
    .int()
    .positive()
    .describe("Numeric leaderboard ID from your Steamworks dashboard (Settings > Leaderboards). This is NOT the leaderboard name - use the numeric ID."),
  rangestart: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Start index for entries (default: 0)"),
  rangeend: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("End index for entries (default: 100)"),
  datarequest: z
    .number()
    .int()
    .min(0)
    .max(2)
    .optional()
    .describe(
      "Request type: 0 = Global, 1 = Around user, 2 = Friends (default: 0)",
    ),
  steamid: z
    .string()
    .regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID")
    .optional()
    .describe("Steam ID required for AroundUser (1) and Friends (2) requests"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getLeaderboardEntries",
    "Get leaderboard scores and rankings for a Steam app. Pass the numeric leaderboard ID from your Steamworks dashboard, not the name. Uses the partner API (partner.steam-api.com) which requires a publisher API key with server IP allowlisted in Steamworks. Supports global, around-user, and friends-only views.",
    inputSchema,
    async ({
      appid,
      leaderboardid,
      rangestart,
      rangeend,
      datarequest,
      steamid,
    }) => {
      try {
        if ((datarequest === 1 || datarequest === 2) && !steamid) {
          return errorResponse(
            new Error(
              "steamid is required when datarequest is 1 (AroundUser) or 2 (Friends).",
            ),
          );
        }

        const key = requireApiKey();
        const url = steamPartnerUrl(
          "/ISteamLeaderboards/GetLeaderboardEntries/v1/",
          {
            key,
            appid,
            leaderboardid,
            rangestart: rangestart ?? 0,
            rangeend: rangeend ?? 100,
            datarequest: datarequest ?? 0,
            steamid,
          },
        );

        const data = (await steamFetch(url)) as {
          leaderboardEntryInformation?: {
            appID?: number;
            leaderboardID?: number;
            totalLeaderBoardEntryCount?: number;
            leaderboardEntries?: Array<Record<string, unknown>>;
          };
        };

        const info = data.leaderboardEntryInformation;

        if (!info) {
          return errorResponse(
            new Error(
              `No leaderboard data found for app ${appid}, leaderboard ${leaderboardid}. The IDs may be invalid or the leaderboard may be empty.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
