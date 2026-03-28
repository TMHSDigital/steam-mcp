import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
  filter: z
    .enum(["recent", "updated", "all"])
    .optional()
    .describe("Review filter: recent, updated, or all (default: recent)"),
  language: z
    .string()
    .optional()
    .describe("Language code for reviews (e.g. english, german, all)"),
  review_type: z
    .enum(["positive", "negative", "all"])
    .optional()
    .describe("Filter by review sentiment (default: all)"),
  purchase_type: z
    .enum(["steam", "non_steam_purchase", "all"])
    .optional()
    .describe("Filter by purchase type (default: all)"),
  num_per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of reviews to return (default: 20, max: 100)"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous response"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getReviews",
    "Fetch user reviews for a Steam app with filters for language, sentiment, purchase type, and pagination. No API key required.",
    inputSchema,
    async ({ appid, filter, language, review_type, purchase_type, num_per_page, cursor }) => {
      try {
        const params = new URLSearchParams({ json: "1" });
        if (filter) params.set("filter", filter);
        if (language) params.set("language", language);
        if (review_type) params.set("review_type", review_type);
        if (purchase_type) params.set("purchase_type", purchase_type);
        if (num_per_page) params.set("num_per_page", String(num_per_page));
        if (cursor) params.set("cursor", cursor);

        const url = `https://store.steampowered.com/appreviews/${appid}?${params}`;
        const data = (await steamFetch(url)) as {
          success?: number;
          query_summary?: {
            num_reviews: number;
            review_score: number;
            review_score_desc: string;
            total_positive: number;
            total_negative: number;
            total_reviews: number;
          };
          reviews?: unknown[];
          cursor?: string;
        };

        if (!data.success) {
          return errorResponse(
            new Error(`Failed to fetch reviews for app ${appid}. The app may not exist.`),
          );
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
