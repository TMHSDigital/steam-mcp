import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamPartnerUrl, steamFetch, requireApiKey, publisherErrorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import { steamIdInput, resolveSteamId } from "../utils/steamid.js";

const inputSchema = {
  steamid: steamIdInput,
  appid: z.number().int().positive().describe("Your app's ID"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_checkAppOwnership",
    {
      title: "Check App Ownership",
      description:
        "Check whether a player owns your app, and how: permanent license or not (Family Sharing, free weekend), acquisition and expiry time, and the true owner when shared. Requires the publisher key that owns the app, with the server IP allowlisted.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ steamid: player, appid }) => {
      try {
        const key = requireApiKey();
        const { steamid, resolved_from } = await resolveSteamId(player);
        const data = (await steamFetch(
          steamPartnerUrl("/ISteamUser/CheckAppOwnership/v4/", { key, steamid, appid }),
        )) as Record<string, unknown>;
        // Older versions wrap the fields in appownership; accept either shape.
        const ownership = (data.appownership ?? data.response ?? ("ownsapp" in data ? data : undefined)) as
          | Record<string, unknown>
          | undefined;
        if (!ownership) {
          return publisherErrorResponse(new Error(`Steam returned no ownership data for ${steamid} on app ${appid}.`));
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ steamid, appid, ...(resolved_from ? { resolved_from } : {}), ...ownership }),
            },
          ],
        };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
