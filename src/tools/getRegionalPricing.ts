import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { fetchAppDetails, classifyPrice } from "../utils/appdetails.js";
import { READ_ONLY } from "../utils/annotations.js";
import { mapPool } from "../utils/pool.js";

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
            const entries = await fetchAppDetails<{ price_overview?: unknown }>([appid], { cc, filters: "price_overview" });
            results[cc] = classifyPrice(entries.get(appid), "Not available in this region");
          } catch (error) {
            results[cc] = {
              error: errorResponse(error).content[0].text,
              error_type: error instanceof Error ? error.name : "UnknownError",
            };
          }
        };

        await mapPool(regions, MAX_CONCURRENT_REGIONS, fetchRegion);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { appid, regions: results }
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
