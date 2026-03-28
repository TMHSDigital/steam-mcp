import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam.getAppReviewSummary",
    "Get review summary statistics for a Steam app: total positive/negative counts, review score, and score description. No individual reviews returned. No API key required.",
    inputSchema,
    async ({ appid }) => {
      try {
        const url = `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&num_per_page=0`;
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
        };

        if (!data.success || !data.query_summary) {
          return errorResponse(
            new Error(`Failed to fetch review summary for app ${appid}. The app may not exist.`),
          );
        }

        const s = data.query_summary;
        const pct = s.total_reviews > 0
          ? Math.round((s.total_positive / s.total_reviews) * 100)
          : 0;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  appid,
                  review_score: s.review_score,
                  review_score_desc: s.review_score_desc,
                  total_reviews: s.total_reviews,
                  total_positive: s.total_positive,
                  total_negative: s.total_negative,
                  positive_percentage: pct,
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
