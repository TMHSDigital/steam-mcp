import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerPost,
  requireApiKey,
  errorResponse,
  publisherErrorResponse,
} from "../utils/steam-api.js";
import {
  confirmSchema,
  refuseIfUnconfirmed,
  refusal,
  dryRunResponse,
} from "../utils/confirm.js";

const MAX_QUANTITY = 100;

/** Random positive uint64 as a decimal string, for AddItem's requestid. */
function randomRequestId(): string {
  return (randomBytes(8).readBigUInt64BE() >> 1n || 1n).toString();
}

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
    .max(MAX_QUANTITY)
    .optional()
    .describe(
      `Number of copies to grant (default: 1, max: ${MAX_QUANTITY}). Sent as repeated itemdefid[n] parameters.`,
    ),
  notify: z
    .boolean()
    .optional()
    .describe("Whether to notify the player of the grant (default: true)"),
  itempropsjson: z
    .string()
    .optional()
    .describe("Optional JSON string of dynamic item properties to set on the granted items"),
  requestid: z
    .string()
    .regex(/^\d{1,20}$/, "Must be a numeric uint64 request ID")
    .optional()
    .describe(
      "Idempotency key. Steam executes a given requestid at most once. A dry run generates one; pass that same value to the live call so a retry cannot double-grant.",
    ),
  ...confirmSchema,
};

export function register(server: McpServer): void {
  server.tool(
    "steam_grantInventoryItem",
    "MUTATES LIVE INVENTORY. Default dry_run=true; requires confirm=true to send. Grant an inventory item to a player via the partner API. Intended for dev/test or server-side rewards. Requires a publisher API key with server IP allowlisted in Steamworks partner settings.",
    inputSchema,
    async ({ appid, steamid, itemdefid, quantity, notify, itempropsjson, requestid, dry_run, confirm }) => {
      try {
        const dryRun = dry_run !== false;
        const blocked = refuseIfUnconfirmed(dryRun, confirm);
        if (blocked) return refusal(blocked);

        // AddItem has no quantity field; each copy is its own itemdefid[n].
        // https://partner.steamgames.com/doc/webapi/IInventoryService#AddItem
        const params: Record<string, string | number | undefined> = {
          appid,
          steamid,
          notify: notify === false ? 0 : 1,
          requestid: requestid ?? randomRequestId(),
          itempropsjson,
        };
        for (let i = 0; i < (quantity ?? 1); i++) {
          params[`itemdefid[${i}]`] = itemdefid;
        }

        if (dryRun) {
          return dryRunResponse("steam_grantInventoryItem", {
            method: "POST",
            endpoint: "/IInventoryService/AddItem/v1/",
            params,
          });
        }

        const key = requireApiKey();

        const data = (await steamPartnerPost(
          "/IInventoryService/AddItem/v1/",
          {
            key,
            ...params,
          },
        )) as {
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
                  requestid: params.requestid,
                  response,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
