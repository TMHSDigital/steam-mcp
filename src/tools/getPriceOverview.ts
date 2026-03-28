import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

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

export function register(server: McpServer): void {
  server.tool(
    "steam.getPriceOverview",
    "Batch price check for multiple Steam apps in a specific region. Returns formatted price data including base price, discount, and final price. No API key required.",
    inputSchema,
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
            results[String(id)] = { free: true, price_overview: null };
          } else {
            results[String(id)] = entry.data.price_overview;
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { region: cc ?? "default", prices: results },
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
