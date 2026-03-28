import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerPost,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";
import { SteamApiError } from "../utils/errors.js";

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
    .describe("Numeric leaderboard ID"),
  steamid: z
    .string()
    .regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID")
    .describe("64-bit Steam ID of the player"),
  score: z
    .number()
    .int()
    .describe("Score to upload (interpretation depends on leaderboard sort method)"),
  scoremethod: z
    .enum(["KeepBest", "ForceUpdate"])
    .optional()
    .describe(
      "KeepBest only updates if better than existing; ForceUpdate always overwrites (default: KeepBest)",
    ),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_uploadLeaderboardScore",
    "Upload a score to a Steam leaderboard via the partner API. Requires a publisher API key with server IP allowlisted in Steamworks partner settings.",
    inputSchema,
    async ({ appid, leaderboardid, steamid, score, scoremethod }) => {
      try {
        const key = requireApiKey();

        const data = (await steamPartnerPost(
          "/ISteamLeaderboards/SetLeaderboardScore/v1/",
          {
            key,
            appid,
            leaderboardid,
            steamid,
            score,
            scoremethod: scoremethod ?? "KeepBest",
          },
        )) as {
          result?: {
            result?: number;
            leaderboard_entry_count?: number;
            score_changed?: boolean;
            global_rank_previous?: number;
            global_rank_new?: number;
          };
        };

        const result = data.result;
        if (!result || result.result !== 1) {
          return errorResponse(
            new Error(
              `Failed to upload score to leaderboard ${leaderboardid} for app ${appid}. Verify the leaderboard ID and that the API key has publisher access.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  appid,
                  leaderboardid,
                  steamid,
                  score,
                  score_changed: result.score_changed,
                  global_rank_new: result.global_rank_new,
                  global_rank_previous: result.global_rank_previous,
                  total_entries: result.leaderboard_entry_count,
                },
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
