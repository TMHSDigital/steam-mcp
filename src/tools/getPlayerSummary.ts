import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import { steamIdInput, resolveSteamId, type ResolvedSteamId } from "../utils/steamid.js";

/** ISteamUser/GetPlayerSummaries takes at most 100 IDs per request. */
const MAX_PLAYERS = 100;

const inputSchema = {
  steamid: steamIdInput.optional(),
  steamids: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_PLAYERS)
    .optional()
    .describe(
      "Several players at once (1-100): Steam64 IDs, profile URLs, vanity names, or SteamID2/3. Use instead of steamid.",
    ),
};

type Player = Record<string, unknown>;

async function fetchSummaries(key: string, ids: string[]): Promise<Player[]> {
  const data = (await steamFetch(
    steamApiUrl("/ISteamUser/GetPlayerSummaries/v2/", { key, steamids: ids.join(",") }),
  )) as { response?: { players?: Player[] } };
  return data.response?.players ?? [];
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getPlayerSummary",
    {
      title: "Get Player Summary",
      description:
        "Get Steam profiles including display name, avatar, online status, and profile visibility. Pass steamid for one player, or steamids for up to 100 in one request (returns players plus not_found). Requires STEAM_API_KEY.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ steamid: player, steamids: many }) => {
      try {
        if ((player === undefined) === (many === undefined)) {
          return errorResponse(new Error("Pass either steamid (one player) or steamids (up to 100 players), not both."));
        }
        const key = requireApiKey();

        if (player !== undefined) {
          const { steamid, resolved_from: resolvedFrom } = await resolveSteamId(player);
          const players = await fetchSummaries(key, [steamid]);
          if (players.length === 0) {
            return errorResponse(
              new Error(
                `No player found with Steam ID ${steamid}. The profile may be private or the ID may be invalid.`,
              ),
            );
          }
          return {
            content: [
              { type: "text", text: JSON.stringify({ ...players[0], ...(resolvedFrom ? { resolved_from: resolvedFrom } : {}) }) },
            ],
          };
        }

        const inputs = [...new Set(many!)];
        const settled = await Promise.allSettled(inputs.map((s) => resolveSteamId(s)));
        const resolved: Array<ResolvedSteamId & { input: string }> = [];
        const unresolved: Array<{ input: string; error: string }> = [];
        settled.forEach((r, i) => {
          if (r.status === "fulfilled") resolved.push({ ...r.value, input: inputs[i] });
          else unresolved.push({ input: inputs[i], error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
        });
        // A rate limit or outage during resolution is not a per-player problem.
        const systemic = settled.find(
          (r): r is PromiseRejectedResult =>
            r.status === "rejected" && !/vanity name|is not a Steam64 ID/.test(String(r.reason?.message ?? r.reason)),
        );
        if (systemic) throw systemic.reason;
        if (resolved.length === 0) {
          return errorResponse(new Error(`None of the players could be resolved: ${unresolved.map((u) => u.error).join(" ")}`));
        }

        const ids = [...new Set(resolved.map((r) => r.steamid))];
        const found = await fetchSummaries(key, ids);
        const foundIds = new Set(found.map((p) => p.steamid));
        const notFound = resolved.filter((r) => !foundIds.has(r.steamid)).map((r) => r.input);
        const resolvedFrom = Object.fromEntries(
          resolved.filter((r) => r.resolved_from && foundIds.has(r.steamid)).map((r) => [r.steamid, r.resolved_from]),
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                players: found,
                not_found: notFound,
                ...(unresolved.length ? { unresolved } : {}),
                ...(Object.keys(resolvedFrom).length ? { resolved_from: resolvedFrom } : {}),
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
