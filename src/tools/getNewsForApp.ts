import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamApiUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID to get news for"),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Number of news items to return (1-20, default 5)"),
  maxlength: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Maximum length of each news item's contents in characters (default 500, 0 for full text)"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getNewsForApp",
    "Get recent news articles for a Steam app. Returns titles, URLs, contents, dates, and authors. No API key required.",
    inputSchema,
    async ({ appid, count, maxlength }) => {
      try {
        const url = steamApiUrl(
          "/ISteamNews/GetNewsForApp/v2/",
          {
            appid,
            count: count ?? 5,
            maxlength: maxlength ?? 500,
          },
        );

        const data = (await steamFetch(url)) as {
          appnews?: {
            appid?: number;
            newsitems?: Array<Record<string, unknown>>;
            count?: number;
          };
        };

        if (!data.appnews?.newsitems || data.appnews.newsitems.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No news found for app ${appid}.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  appid: data.appnews.appid,
                  count: data.appnews.newsitems.length,
                  newsitems: data.appnews.newsitems,
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
