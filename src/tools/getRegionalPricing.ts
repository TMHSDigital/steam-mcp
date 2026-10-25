import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const DEFAULT_REGIONS = ["US", "GB", "DE", "BR", "RU", "CN", "JP", "AU", "IN", "TR"];
const MAX_CONCURRENT_REGIONS = 4;

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
      "Two-letter country codes to check (default: US, GB, DE, BR, RU, CN, JP, AU, IN, TR). Max 20.",
    ),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getRegionalPricing",
    {
      title: "Get Regional Pricing",
      description:
        "Get pricing for a Steam app across multiple regions/countries. Returns price, currency, and discount info for each region. No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid, countries }) => {
      try {
        const regions = countries ?? DEFAULT_REGIONS;
        const results: Record<string, unknown> = {};

        const fetchRegion = async (cc: string) => {
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
              results[cc] = { price_overview: null, reason: "no_price_listed" };
            } else {
              results[cc] = entry.data.price_overview;
            }
          } catch (error) {
            results[cc] = {
              error: errorResponse(error).content[0].text,
              error_type: error instanceof Error ? error.name : "UnknownError",
            };
          }
        };

        let nextRegion = 0;
        await Promise.all(Array.from(
          { length: Math.min(MAX_CONCURRENT_REGIONS, regions.length) },
          async () => {
            while (nextRegion < regions.length) {
              const cc = regions[nextRegion++];
              await fetchRegion(cc);
            }
          },
        ));

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
