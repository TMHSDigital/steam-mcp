import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID (e.g. 440 for Team Fortress 2)"),
  cc: z
    .string()
    .length(2)
    .optional()
    .describe("Two-letter country code for pricing (e.g. US, GB, DE)"),
  l: z
    .string()
    .optional()
    .describe("Language code for descriptions (e.g. english, german)"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam.getAppDetails",
    "Get Steam store data for an app including price, description, reviews, tags, platforms, and system requirements. No API key required.",
    inputSchema,
    async ({ appid, cc, l }) => {
      try {
        const url = steamStoreUrl("/api/appdetails", {
          appids: appid,
          cc,
          l,
        });

        const data = (await steamFetch(url)) as Record<
          string,
          { success: boolean; data?: unknown }
        >;

        const entry = data[String(appid)];
        if (!entry || !entry.success || !entry.data) {
          return errorResponse(
            new Error(
              `App ${appid} data is not available in the Steam store. The app may not exist, or it may be region-locked.`,
            ),
          );
        }

        return {
          content: [
            { type: "text", text: JSON.stringify(entry.data, null, 2) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
