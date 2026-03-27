import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  term: z.string().min(1).describe("Search query for games or apps"),
  cc: z
    .string()
    .length(2)
    .optional()
    .describe("Two-letter country code for pricing (e.g. US, GB)"),
  l: z
    .string()
    .optional()
    .describe("Language code (e.g. english, german). Defaults to english."),
};

export function register(server: McpServer): void {
  server.tool(
    "steam.searchApps",
    "Search the Steam store for games and apps by name. Returns app IDs, names, icons, and price info. No API key required.",
    inputSchema,
    async ({ term, cc, l }) => {
      try {
        const url = steamStoreUrl("/api/storesearch/", {
          term,
          l: l ?? "english",
          cc: cc ?? "US",
        });

        const data = (await steamFetch(url)) as { items?: unknown[] };

        if (!data.items || data.items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No results found for "${term}".`,
              },
            ],
          };
        }

        return {
          content: [
            { type: "text", text: JSON.stringify(data.items, null, 2) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
