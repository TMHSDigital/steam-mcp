import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerPost,
  requireApiKey,
  errorResponse,
  publisherErrorResponse,
} from "../utils/steam-api.js";
import {
  confirmSchema,
  refuseIfUnconfirmed,
  refusal,
  dryRunResponse,
} from "../utils/confirm.js";
import { LIVE_WRITE } from "../utils/annotations.js";
import { leaderboardSelectorError, resolveLeaderboardName } from "../utils/leaderboards.js";

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
    .describe("Numeric leaderboard ID. Required for the live call (dry_run: false)."),
  leaderboard_name: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .optional()
    .describe(
      "Leaderboard name, dry run only: it is resolved to the numeric ID and shown in the plan. Pass that leaderboardid to the live call.",
    ),
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
  ...confirmSchema,
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_uploadLeaderboardScore",
    {
      title: "Upload Leaderboard Score",
      description:
        "MUTATES LIVE LEADERBOARD ENTRY. Default dry_run=true; requires confirm=true to send. Upload a score to a Steam leaderboard via the partner API. A dry run accepts leaderboard_name and shows the resolved leaderboardid; the live call takes only the numeric leaderboardid, so the board you confirmed is the board that is written. Requires a publisher API key with server IP allowlisted in Steamworks partner settings.",
      inputSchema,
      annotations: LIVE_WRITE,
    },
    async ({ appid, leaderboardid, leaderboard_name, steamid, score, scoremethod, dry_run, confirm }) => {
      try {
        const dryRun = dry_run !== false;
        const blocked = refuseIfUnconfirmed(dryRun, confirm);
        if (blocked) return refusal(blocked);

        const selectorError = leaderboardSelectorError(leaderboardid, leaderboard_name);
        if (selectorError) {
          return errorResponse(new Error(selectorError));
        }
        if (!dryRun && leaderboard_name !== undefined) {
          return errorResponse(
            new Error(
              "The live call needs the numeric leaderboardid, not leaderboard_name. Run a dry run with leaderboard_name to see the resolved ID, then pass it as leaderboardid. No request was sent.",
            ),
          );
        }

        // Resolving a name is a read-only lookup on the partner host, so a
        // dry run with leaderboard_name needs the key; with leaderboardid it
        // stays offline.
        const resolved =
          leaderboard_name !== undefined
            ? await resolveLeaderboardName(appid, leaderboard_name, requireApiKey())
            : undefined;

        const params = {
          appid,
          leaderboardid: resolved?.leaderboardid ?? (leaderboardid as number),
          steamid,
          score,
          scoremethod: scoremethod ?? "KeepBest",
        };

        if (dryRun) {
          return dryRunResponse("steam_uploadLeaderboardScore", {
            method: "POST",
            endpoint: "/ISteamLeaderboards/SetLeaderboardScore/v1/",
            params,
            ...(resolved ? { resolved_from: resolved.resolved_from } : {}),
          });
        }

        const key = requireApiKey();

        const data = (await steamPartnerPost(
          "/ISteamLeaderboards/SetLeaderboardScore/v1/",
          {
            key,
            ...params,
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
        return publisherErrorResponse(error);
      }
    },
  );
}
