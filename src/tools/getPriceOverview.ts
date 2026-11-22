import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appids: z
    .array(z.number().int().positive())
    .min(1)
    .max(50)
    .describe("Array of Steam application IDs to check prices for (max 50)"),
  cc: z
    .string()
    .length(2)
    .optional()
    .describe("Two-letter country code for pricing (e.g. US, GB, DE). Defaults to server region."),
};

// Fields are optional and extra keys allowed: this is Steam's object passed
// through, and a strict schema would fail the whole call if Steam changed it.
const priceOverview = z.looseObject({
  currency: z.string().optional(),
  initial: z.number().optional(),
  final: z.number().optional(),
  discount_percent: z.number().optional(),
  initial_formatted: z.string().optional(),
  final_formatted: z.string().optional(),
});

const outputSchema = {
  region: z.string().describe('Country code, or "default"'),
  prices: z
    .record(
      z.string(),
      // priceOverview accepts any object, so it goes last.
      z.union([
        z.object({ error: z.string() }),
        z.object({ price_overview: z.null(), reason: z.literal("no_price_listed") }),
        priceOverview,
      ]),
    )
    .describe("Keyed by appid: Steam's price_overview (prices in cents), no listed price, or an error"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getPriceOverview",
    {
      title: "Get Price Overview",
      description:
        "Batch price check for multiple Steam apps in a specific region. Returns formatted price data including base price, discount, and final price. No API key required.",
      inputSchema,
      outputSchema,
      annotations: READ_ONLY,
    },
    async ({ appids, cc }) => {
      try {
        const url = steamStoreUrl("/api/appdetails", {
          appids: appids.join(","),
          filters: "price_overview",
          cc,
        });

        const data = (await steamFetch(url)) as Record<
          string,
          { success: boolean; data?: { price_overview?: unknown } }
        >;

        const results: Record<string, unknown> = {};
        for (const id of appids) {
          const entry = data[String(id)];
          if (!entry || !entry.success) {
            results[String(id)] = { error: "App not found or region-locked" };
          } else if (!entry.data?.price_overview) {
            results[String(id)] = { price_overview: null, reason: "no_price_listed" };
          } else {
            results[String(id)] = entry.data.price_overview;
          }
        }

        const structured = { region: cc ?? "default", prices: results };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured) }],
          structuredContent: structured,
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
