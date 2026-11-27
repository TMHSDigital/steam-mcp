import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

/** storesearch returns at most 10 items. */
const MAX_RESULTS = 10;

const inputSchema = {
  query: z.string().min(1).describe("Search query for games or apps (e.g. 'Hades', 'Counter-Strike')"),
  cc: z
    .string()
    .length(2)
    .optional()
    .describe("Two-letter country code for pricing (e.g. US, GB)"),
  l: z
    .string()
    .optional()
    .describe("Language code (e.g. english, german). Defaults to english."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULTS)
    .optional()
    .describe(`Maximum results (1-${MAX_RESULTS}, default ${MAX_RESULTS})`),
};

interface SearchItem {
  type?: string;
  name?: string;
  id?: number;
  price?: { currency?: string; initial?: number; final?: number };
  metascore?: string;
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
}

/** Same field names as steam_getFeatured; image and video fields are dropped. */
function compact(item: SearchItem) {
  const initial = item.price?.initial;
  const final = item.price?.final;
  const metascore = Number(item.metascore);
  return {
    appid: item.id,
    name: item.name,
    type: item.type,
    final_price: final,
    original_price: initial !== undefined && initial !== final ? initial : undefined,
    discount_percent:
      initial && final !== undefined && initial > final ? Math.round((1 - final / initial) * 100) : undefined,
    currency: item.price?.currency,
    platforms: (["windows", "mac", "linux"] as const).filter((p) => item.platforms?.[p]),
    metascore: item.metascore && Number.isFinite(metascore) ? metascore : undefined,
  };
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_searchApps",
    {
      title: "Search Apps",
      description:
        "Search the Steam store for games and apps by name or keyword. Returns up to 10 matches as { appid, name, type, final_price, original_price, discount_percent, currency, platforms, metascore }; prices are in the currency's smallest unit (cents), and are left out when Steam lists none (free or unreleased). No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ query, cc, l, limit }) => {
      try {
        const url = steamStoreUrl("/api/storesearch/", {
          term: query,
          l: l ?? "english",
          cc: cc ?? "US",
        });

        const data = (await steamFetch(url)) as { items?: SearchItem[] };

        if (!data.items || data.items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No results found for "${query}".`,
              },
            ],
          };
        }

        return {
          content: [
            { type: "text", text: JSON.stringify(data.items.slice(0, limit ?? MAX_RESULTS).map(compact)) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
