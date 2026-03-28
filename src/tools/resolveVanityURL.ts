import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";

const inputSchema = {
  vanityurl: z
    .string()
    .min(1)
    .describe(
      "The vanity URL part of a Steam profile (e.g. 'gabelogannewell' from steamcommunity.com/id/gabelogannewell)",
    ),
  url_type: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe(
      "Type of vanity URL: 1 = individual profile (default), 2 = group, 3 = official game group",
    ),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_resolveVanityURL",
    "Convert a Steam vanity URL (custom profile name) to a 64-bit Steam ID. Requires STEAM_API_KEY.",
    inputSchema,
    async ({ vanityurl, url_type }) => {
      try {
        const key = requireApiKey();
        const url = steamApiUrl("/ISteamUser/ResolveVanityURL/v1/", {
          key,
          vanityurl,
          url_type: url_type ?? 1,
        });

        const data = (await steamFetch(url)) as {
          response?: { success?: number; steamid?: string; message?: string };
        };

        if (!data.response || data.response.success !== 1) {
          return errorResponse(
            new Error(
              `Could not resolve vanity URL "${vanityurl}". No matching Steam profile found.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  vanityurl,
                  steamid: data.response.steamid,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
