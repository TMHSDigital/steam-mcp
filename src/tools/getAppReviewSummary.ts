import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { fetchAppReviews } from "../utils/reviews.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getAppReviewSummary",
    {
      title: "Get App Review Summary",
      description:
        "Get all-time review summary statistics for a Steam app across all languages and purchase types: total positive/negative counts, review score, and score description. No individual reviews returned. No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid }) => {
      try {
        const data = await fetchAppReviews({
          appid,
          languages: ["all"],
          purchase_type: "all",
          num_per_page: 1,
        });

        const s = data.query_summary;
        if (!s || s.total_reviews === undefined) {
          return errorResponse(
            new Error(`Failed to fetch review summary for app ${appid}. The app may not exist.`),
          );
        }

        const totalPositive = s.total_positive ?? 0;
        const pct = s.total_reviews > 0
          ? Math.round((totalPositive / s.total_reviews) * 100)
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
                  total_positive: totalPositive,
                  total_negative: s.total_negative ?? 0,
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
