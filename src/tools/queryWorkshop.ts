import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamApiUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("App ID to search workshop items for (e.g. 440 for TF2)"),
  search_text: z
    .string()
    .optional()
    .describe("Text to search for in item titles and descriptions"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor. Use '*' for the first request, then pass the cursor from previous results."),
  numperpage: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of results per page (1-100, default 10)"),
  query_type: z
    .number()
    .int()
    .optional()
    .describe(
      "Query type: 0 = ranked by vote, 1 = ranked by date, 2 = ranked by trending, 3 = favorited by friends, etc.",
    ),
  requiredtags: z
    .string()
    .optional()
    .describe("Comma-separated tags that items must have"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_queryWorkshop",
    "Search and browse Steam Workshop items for a given app. Filter by text, tags, and sort order. Requires STEAM_API_KEY.",
    inputSchema,
    async ({ appid, search_text, cursor, numperpage, query_type, requiredtags }) => {
      try {
        const key = requireApiKey();
        const url = steamApiUrl("/IPublishedFileService/QueryFiles/v1/", {
          key,
          appid,
          search_text,
          cursor: cursor ?? "*",
          numperpage: numperpage ?? 10,
          query_type: query_type ?? 1,
          requiredtags,
          return_short_description: true,
        });

        const data = (await steamFetch(url)) as {
          response?: {
            total?: number;
            publishedfiledetails?: Array<Record<string, unknown>>;
            next_cursor?: string;
          };
        };

        if (!data.response) {
          return errorResponse(
            new Error("Unexpected response from Steam API."),
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: data.response.total,
                  next_cursor: data.response.next_cursor,
                  items: data.response.publishedfiledetails ?? [],
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
