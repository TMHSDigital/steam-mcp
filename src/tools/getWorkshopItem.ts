import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamApiUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  publishedfileid: z
    .string()
    .regex(/^\d+$/, "Must be a numeric Workshop item ID")
    .describe("Workshop item ID (the numeric ID from the workshop URL)"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam.getWorkshopItem",
    "Get details for a Steam Workshop item including title, description, tags, preview images, and subscriber count. No API key required.",
    inputSchema,
    async ({ publishedfileid }) => {
      try {
        const url = steamApiUrl(
          "/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        );

        const body = new URLSearchParams();
        body.set("itemcount", "1");
        body.set("publishedfileids[0]", publishedfileid);

        const data = (await steamFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        })) as {
          response?: {
            publishedfiledetails?: Array<{
              result?: number;
              [key: string]: unknown;
            }>;
          };
        };

        const details = data.response?.publishedfiledetails?.[0];

        if (!details || details.result !== 1) {
          return errorResponse(
            new Error(
              `Workshop item ${publishedfileid} not found. The item may have been removed or the ID may be invalid.`,
            ),
          );
        }

        return {
          content: [
            { type: "text", text: JSON.stringify(details, null, 2) },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
