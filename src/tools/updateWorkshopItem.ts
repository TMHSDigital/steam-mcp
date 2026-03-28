import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";

const inputSchema = {
  publishedfileid: z
    .string()
    .regex(/^\d+$/, "Must be a numeric published file ID")
    .describe("Workshop item's published file ID"),
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
  title: z.string().optional().describe("New title for the item"),
  file_description: z
    .string()
    .optional()
    .describe("New description for the item"),
  visibility: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe("Visibility: 0=Public, 1=FriendsOnly, 2=Private, 3=Unlisted"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Replace the item's tags with this list"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_updateWorkshopItem",
    "Update metadata for an existing Steam Workshop item (title, description, visibility, tags) via the partner API. Requires a publisher API key with server IP allowlisted. File content updates require the SDK.",
    inputSchema,
    async ({ publishedfileid, appid, title, file_description, visibility, tags }) => {
      try {
        const key = requireApiKey();

        const params: Record<string, string | number | boolean | undefined> = {
          key,
          publishedfileid,
          appid,
          title,
          file_description,
          visibility,
        };

        if (tags && tags.length > 0) {
          tags.forEach((tag, i) => {
            params[`tags[${i}]`] = tag;
          });
        }

        const url = steamPartnerUrl(
          "/IPublishedFileService/UpdateDetails/v1/",
          params,
        );

        const data = await steamFetch(url, { method: "POST" });

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
