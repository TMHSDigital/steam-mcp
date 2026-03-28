import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const DEFAULT_REGIONS = ["US", "GB", "EU", "BR", "RU", "CN", "JP", "AU", "IN", "TR"];

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
  countries: z
    .array(z.string().length(2))
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Two-letter country codes to check (default: US, GB, EU, BR, RU, CN, JP, AU, IN, TR). Max 20.",
    ),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getRegionalPricing",
    "Get pricing for a Steam app across multiple regions/countries. Returns price, currency, and discount info for each region. No API key required.",
    inputSchema,
    async ({ appid, countries }) => {
      try {
        const regions = countries ?? DEFAULT_REGIONS;
        const results: Record<string, unknown> = {};

        const fetches = regions.map(async (cc) => {
          try {
            const url = steamStoreUrl("/api/appdetails", {
              appids: appid,
              cc,
              filters: "price_overview",
            });

            const data = (await steamFetch(url)) as Record<
              string,
              { success: boolean; data?: { price_overview?: unknown } }
            >;

            const entry = data[String(appid)];
            if (!entry || !entry.success) {
              results[cc] = { error: "Not available in this region" };
            } else if (!entry.data?.price_overview) {
              results[cc] = { free: true };
            } else {
              results[cc] = entry.data.price_overview;
            }
          } catch {
            results[cc] = { error: "Failed to fetch" };
          }
        });

        await Promise.all(fetches);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { appid, regions: results },
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
