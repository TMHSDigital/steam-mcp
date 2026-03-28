import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerUrl,
  steamFetch,
  requireApiKey,
  errorResponse,
} from "../utils/steam-api.js";
import { SteamApiError } from "../utils/errors.js";

const inputSchema = {
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
  steamid: z
    .string()
    .regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID")
    .describe("64-bit Steam ID of the player to grant the item to"),
  itemdefid: z
    .number()
    .int()
    .positive()
    .describe(
      "Item definition ID from your Steamworks item schema",
    ),
  quantity: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Number of items to grant (default: 1)"),
  notify: z
    .boolean()
    .optional()
    .describe("Whether to notify the player of the grant (default: true)"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_grantInventoryItem",
    "Grant an inventory item to a player via the partner API. Intended for dev/test or server-side rewards. Requires a publisher API key with server IP allowlisted in Steamworks partner settings.",
    inputSchema,
    async ({ appid, steamid, itemdefid, quantity, notify }) => {
      try {
        const key = requireApiKey();

        const itemJson = JSON.stringify([
          { itemdefid, quantity: quantity ?? 1 },
        ]);

        const url = steamPartnerUrl(
          "/IInventoryService/AddItem/v1/",
          {
            key,
            appid,
            steamid,
            itemdefid: JSON.stringify([{ itemdefid, quantity: quantity ?? 1 }]),
            notify: notify ?? true,
          },
        );

        const data = (await steamFetch(url, { method: "POST" })) as {
          response?: {
            item_json?: string;
          };
        };

        const response = data.response;
        if (!response) {
          return errorResponse(
            new Error(
              `Failed to grant item ${itemdefid} to Steam ID ${steamid}. Verify the item definition exists in your Steamworks inventory schema and the API key has publisher access.`,
            ),
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  appid,
                  steamid,
                  itemdefid,
                  quantity: quantity ?? 1,
                  response,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SteamApiError && (error.statusCode === 400 || error.statusCode === 403)) {
          return errorResponse(
            new Error(
              `HTTP ${error.statusCode} - This tool requires a Steam Publisher API key with the server's IP allowlisted in your Steamworks partner settings. Set STEAM_API_KEY to a publisher key and add the server IP to your Web API key's allowed IP list at https://partner.steamgames.com/doc/webapi_overview/auth`,
            ),
          );
        }
        return errorResponse(error);
      }
    },
  );
}
