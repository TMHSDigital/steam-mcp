import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamApiUrl, steamFetch, requireApiKey, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import { resolveSteamId } from "../utils/steamid.js";

const inputSchema = {
  steamids: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(100)
    .describe("Players to check (1-100): Steam64 IDs, profile URLs, vanity names, or SteamID2/3"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getPlayerBans",
    {
      title: "Get Player Bans",
      description:
        "Get VAC, game, community, and economy ban status for up to 100 players, for moderation and support triage. Requires STEAM_API_KEY.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ steamids }) => {
      try {
        const key = requireApiKey();
        const resolved = await Promise.all(steamids.map((s) => resolveSteamId(s)));
        const data = (await steamFetch(
          steamApiUrl("/ISteamUser/GetPlayerBans/v1/", { key, steamids: resolved.map((r) => r.steamid).join(",") }),
        )) as { players?: unknown[] };
        if (!data.players) {
          return errorResponse(new Error("Steam returned no ban data."));
        }
        const inputs = Object.fromEntries(
          resolved.filter((r) => r.resolved_from).map((r) => [r.steamid, r.resolved_from]),
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                players: data.players,
                ...(Object.keys(inputs).length ? { resolved_from: inputs } : {}),
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
