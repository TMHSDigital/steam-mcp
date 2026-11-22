import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
  publisherErrorResponse,
} from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import {
  leaderboardNameSchema,
  leaderboardSelectorError,
  resolveLeaderboardName,
} from "../utils/leaderboards.js";

/** Keeps one call from returning thousands of entries into the agent's context. */
const MAX_ENTRIES_PER_CALL = 500;

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
    .optional()
    .describe("Numeric leaderboard ID (Steamworks dashboard > Leaderboards, or steam_getLeaderboardsForGame). Pass this or leaderboard_name."),
  leaderboard_name: leaderboardNameSchema,
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
    .describe(`End index for entries, inclusive (default: 100). At most ${MAX_ENTRIES_PER_CALL} entries per call; page with rangestart/rangeend.`),
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
  server.registerTool(
    "steam_getLeaderboardEntries",
    {
      title: "Get Leaderboard Entries",
      description:
        "Get leaderboard scores and rankings for a Steam app. Pass the numeric leaderboardid or the leaderboard_name (resolved through GetLeaderboardsForGame; the output then includes resolved_from). Uses the partner API (partner.steam-api.com) which requires a publisher API key with server IP allowlisted in Steamworks. Supports global, around-user, and friends-only views.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({
      appid,
      leaderboardid,
      leaderboard_name,
      rangestart,
      rangeend,
      datarequest,
      steamid,
    }) => {
      try {
        const selectorError = leaderboardSelectorError(leaderboardid, leaderboard_name);
        if (selectorError) {
          return errorResponse(new Error(selectorError));
        }
        const start = rangestart ?? 0;
        const end = rangeend ?? 100;
        if (end < start) {
          return errorResponse(new Error("rangeend must be greater than or equal to rangestart."));
        }
        if (end - start + 1 > MAX_ENTRIES_PER_CALL) {
          return errorResponse(
            new Error(
              `At most ${MAX_ENTRIES_PER_CALL} entries per call (asked for ${end - start + 1}). Page through the board: rangestart ${start}, rangeend ${start + MAX_ENTRIES_PER_CALL - 1}, then continue from ${start + MAX_ENTRIES_PER_CALL}.`,
            ),
          );
        }
        if ((datarequest === 1 || datarequest === 2) && !steamid) {
          return errorResponse(
            new Error(
              "steamid is required when datarequest is 1 (AroundUser) or 2 (Friends).",
            ),
          );
        }

        const key = requireApiKey();
        const resolved =
          leaderboard_name !== undefined
            ? await resolveLeaderboardName(appid, leaderboard_name, key)
            : { leaderboardid: leaderboardid as number, resolved_from: undefined };
        const url = steamPartnerUrl(
          "/ISteamLeaderboards/GetLeaderboardEntries/v1/",
          {
            key,
            appid,
            leaderboardid: resolved.leaderboardid,
            rangestart: start,
            rangeend: end,
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
              `No leaderboard data found for app ${appid}, leaderboard ${resolved.leaderboardid}. The IDs may be invalid or the leaderboard may be empty.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                resolved.resolved_from ? { resolved_from: resolved.resolved_from, ...info } : info
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
