import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const CATEGORIES = ["top_sellers", "new_releases", "specials", "coming_soon"] as const;

const inputSchema = {
  categories: z
    .array(z.enum(CATEGORIES))
    .optional()
    .describe("Which lists to return (default: all four)"),
  cc: z.string().length(2).optional().describe("Two-letter country code for prices and regional lists (default: US)"),
  limit: z.number().int().min(1).max(30).optional().describe("Items per list (default: 10)"),
};

interface FeaturedItem {
  id: number;
  name: string;
  type?: number;
  discounted?: boolean;
  discount_percent?: number;
  original_price?: number | null;
  final_price?: number;
  currency?: string;
  windows_available?: boolean;
  mac_available?: boolean;
  linux_available?: boolean;
  discount_expiration?: number;
}

function compact(item: FeaturedItem) {
  return {
    appid: item.id,
    name: item.name,
    final_price: item.final_price,
    original_price: item.original_price ?? undefined,
    discount_percent: item.discount_percent || undefined,
    discount_expiration: item.discount_expiration,
    currency: item.currency,
    platforms: [
      item.windows_available ? "windows" : undefined,
      item.mac_available ? "mac" : undefined,
      item.linux_available ? "linux" : undefined,
    ].filter(Boolean),
  };
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getFeatured",
    {
      title: "Get Featured",
      description:
        "Get the Steam store's current top sellers, new releases, specials, and coming-soon lists for a region. Prices are in the currency's smallest unit (cents). No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ categories, cc, limit }) => {
      try {
        const data = (await steamFetch(
          steamStoreUrl("/api/featuredcategories", { cc: cc ?? "US", l: "english" }),
        )) as Record<string, { name?: string; items?: FeaturedItem[] } | undefined>;

        const lists: Record<string, unknown> = {};
        for (const category of categories ?? CATEGORIES) {
          const list = data[category];
          lists[category] = (list?.items ?? []).slice(0, limit ?? 10).map(compact);
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ region: cc ?? "US", lists }) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
