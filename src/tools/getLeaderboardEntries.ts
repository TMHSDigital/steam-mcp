import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
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

/** ISteamUser/GetPlayerSummaries takes at most 100 IDs per request. */
const SUMMARIES_PER_REQUEST = 100;

/**
 * Add each entry's persona name, looked up in batches of 100 IDs. Returns a
 * warning instead of throwing, so a failed lookup never loses the scores.
 */
async function addPersonaNames(entries: Array<Record<string, unknown>>, key: string): Promise<string | undefined> {
  const ids = [...new Set(entries.map((e) => e.steamID).filter((id): id is string => typeof id === "string" && id !== ""))];
  const names = new Map<string, string>();
  try {
    for (let i = 0; i < ids.length; i += SUMMARIES_PER_REQUEST) {
      const data = (await steamFetch(
        steamApiUrl("/ISteamUser/GetPlayerSummaries/v2/", {
          key,
          steamids: ids.slice(i, i + SUMMARIES_PER_REQUEST).join(","),
        }),
      )) as { response?: { players?: Array<{ steamid?: string; personaname?: string }> } };
      for (const p of data.response?.players ?? []) {
        if (p.steamid && p.personaname !== undefined) names.set(p.steamid, p.personaname);
      }
    }
  } catch (error) {
    return `Player names could not be looked up (${error instanceof Error ? error.message : String(error)}); entries are shown without them.`;
  }
  for (const e of entries) {
    const name = names.get(e.steamID as string);
    if (name !== undefined) e.personaname = name;
  }
  return undefined;
}

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
    .optional()
    .describe(
      "Start of the range. Global (0) and Friends (2): a rank index, 0 or more (default: 0). Around user (1): an offset from the user, negative for players above them (default: -10).",
    ),
  rangeend: z
    .number()
    .int()
    .optional()
    .describe(
      `End of the range, inclusive. Global and Friends: a rank index (default: 100). Around user: an offset from the user (default: 10). At most ${MAX_ENTRIES_PER_CALL} entries per call; page with rangestart/rangeend.`,
    ),
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
  include_names: z
    .boolean()
    .optional()
    .describe(
      "Add each player's persona name (personaname) to the entries, looked up with ISteamUser/GetPlayerSummaries in batches of 100 (default: false)",
    ),
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
      include_names,
    }) => {
      try {
        const selectorError = leaderboardSelectorError(leaderboardid, leaderboard_name);
        if (selectorError) {
          return errorResponse(new Error(selectorError));
        }
        // Around-user requests read the range as offsets from the user, so
        // negative values mean players ranked above them (#100).
        const aroundUser = datarequest === 1;
        const start = rangestart ?? (aroundUser ? -10 : 0);
        const end = rangeend ?? (aroundUser ? 10 : 100);
        if (!aroundUser && (start < 0 || end < 0)) {
          return errorResponse(
            new Error(
              "rangestart and rangeend must be 0 or more, except with datarequest 1 (around user), where they are offsets from the user.",
            ),
          );
        }
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

        const namesWarning =
          include_names && info.leaderboardEntries?.length
            ? await addPersonaNames(info.leaderboardEntries, key)
            : undefined;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...(resolved.resolved_from ? { resolved_from: resolved.resolved_from } : {}),
                ...info,
                ...(namesWarning ? { names_warning: namesWarning } : {}),
              }),
            },
          ],
        };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
