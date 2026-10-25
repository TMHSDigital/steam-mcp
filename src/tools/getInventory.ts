import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamPartnerUrl, steamFetch, requireApiKey, publisherErrorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import { steamIdInput, resolveSteamId } from "../utils/steamid.js";

const inputSchema = {
  steamid: steamIdInput,
  appid: z.number().int().positive().describe("Your app's ID"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getInventory",
    {
      title: "Get Inventory",
      description:
        "Read a player's Steam Inventory items for your app, for example to confirm a steam_grantInventoryItem landed. Requires a publisher key with Economy permissions, with the server IP allowlisted.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ steamid: player, appid }) => {
      try {
        const key = requireApiKey();
        const { steamid, resolved_from } = await resolveSteamId(player);
        const data = (await steamFetch(
          steamPartnerUrl("/IInventoryService/GetInventory/v1/", { key, appid, steamid }),
        )) as { response?: { success?: boolean; error?: string; item_json?: string } };

        const r = data.response;
        if (!r || r.success === false || r.item_json === undefined) {
          return publisherErrorResponse(
            new Error(`Could not read the inventory of ${steamid} for app ${appid}${r?.error ? `: ${r.error}` : "."}`),
          );
        }

        let items: unknown;
        try {
          items = JSON.parse(r.item_json);
        } catch {
          items = r.item_json;
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                steamid,
                appid,
                ...(resolved_from ? { resolved_from } : {}),
                item_count: Array.isArray(items) ? items.length : undefined,
                items,
              }),
            },
          ],
        };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
