import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  indexedParams,
  errorResponse,
  requireApiKey,
} from "../utils/steam-api.js";
import { MissingApiKeyError } from "../utils/errors.js";
import { READ_ONLY } from "../utils/annotations.js";

// GetGlobalStatsForGame takes at most this many names per request.
const MAX_NAMES = 50;

const inputSchema = {
  appid: z.number().int().positive().describe("Steam application ID"),
  stat_names: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_NAMES)
    .optional()
    .describe(
      "Stat API names to total. Only stats flagged as aggregated in Steamworks work. If omitted and STEAM_API_KEY is set, the first 50 stats from the app's schema are requested, and the output says how many were left out.",
    ),
  history_days: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe("Also return a daily total for each of the last N days (1-60)"),
};

type GlobalStats = Record<string, { total?: number | string | null; history?: Array<{ date: number; total: number | string }> }>;

/** Stat names from the app's schema: the first MAX_NAMES, plus the full count. */
async function schemaStatNames(appid: number): Promise<{ names: string[]; total: number }> {
  let key: string;
  try {
    key = requireApiKey();
  } catch (error) {
    if (!(error instanceof MissingApiKeyError)) throw error;
    throw new Error(
      "Pass stat_names. Without STEAM_API_KEY the server cannot look up the app's stat names (steam_getSchemaForGame needs a key).",
    );
  }
  const data = (await steamFetch(steamApiUrl("/ISteamUserStats/GetSchemaForGame/v2/", { key, appid }))) as {
    game?: { availableGameStats?: { stats?: Array<{ name?: string }> } };
  };
  const names = (data.game?.availableGameStats?.stats ?? []).map((s) => s.name).filter((n): n is string => Boolean(n));
  if (names.length === 0) {
    throw new Error(`App ${appid} has no stats in its schema.`);
  }
  return { names: names.slice(0, MAX_NAMES), total: names.length };
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getGlobalStatsForGame",
    {
      title: "Get Global Stats For Game",
      description:
        "Get all-player totals for a game's aggregated stats (for example total kills or distance traveled), optionally with daily history. Only stats flagged as aggregated in Steamworks return data. No API key required when stat_names is given.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid, stat_names, history_days }) => {
      try {
        const schema = stat_names ? undefined : await schemaStatNames(appid);
        const names = stat_names ?? schema!.names;
        const now = Math.floor(Date.now() / 1000);
        const url = steamApiUrl("/ISteamUserStats/GetGlobalStatsForGame/v1/", {
          appid,
          count: names.length,
          ...indexedParams("name", names),
          startdate: history_days ? now - history_days * 86400 : undefined,
          enddate: history_days ? now : undefined,
        });

        const data = (await steamFetch(url)) as {
          response?: { result?: number; error?: string; globalstats?: GlobalStats };
        };
        const response = data.response;
        if (!response || response.result !== 1 || !response.globalstats) {
          const reason = response?.error ?? `EResult ${response?.result ?? "missing"}`;
          return errorResponse(
            new Error(
              `Steam returned no global stats for app ${appid}: ${reason}. Only stats marked as aggregated ("global") in Steamworks can be totaled.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                appid,
                stats: response.globalstats,
                // Say when the schema had more stats than one request takes (#121).
                ...(schema && schema.total > names.length
                  ? {
                      schema_stat_count: schema.total,
                      skipped: schema.total - names.length,
                      note: `Requested the first ${names.length} of ${schema.total} schema stats. Pass stat_names (up to ${MAX_NAMES}) for the others.`,
                    }
                  : {}),
              }),
            },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
