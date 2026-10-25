import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  indexedParams,
  errorResponse,
} from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appid: z.number().int().positive().describe("Steam application ID"),
  stat_names: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Stat API names to total. Only stats flagged as aggregated in Steamworks work. If omitted and STEAM_API_KEY is set, all stats from the app's schema are requested.",
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

async function schemaStatNames(appid: number): Promise<string[]> {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
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
  return names.slice(0, 50);
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
        const names = stat_names ?? (await schemaStatNames(appid));
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
              text: JSON.stringify({ appid, stats: response.globalstats }),
            },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
