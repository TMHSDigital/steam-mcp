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
import { LIVE_WRITE_IDEMPOTENT } from "../utils/annotations.js";

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
    .describe("Replace the item's tags with this list (at least one tag; the Web API cannot clear tags)"),
  ...confirmSchema,
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_updateWorkshopItem",
    {
      title: "Update Workshop Item",
      description:
        "MUTATES LIVE WORKSHOP ITEM METADATA. Default dry_run=true; requires confirm=true to send. Update metadata for an existing Steam Workshop item (title, description, visibility, tags) via the partner API. Does not change the store page listing. Requires a publisher API key with server IP allowlisted. File content updates require the SDK.",
      inputSchema,
      annotations: LIVE_WRITE_IDEMPOTENT,
    },
    async ({ publishedfileid, appid, title, file_description, visibility, tags, dry_run, confirm }) => {
      try {
        // Refuse before any plan or request: an empty tag list would be
        // dropped and the call would report success while changing nothing (#120).
        if (tags && tags.length === 0) {
          return errorResponse(
            new Error(
              "tags: [] cannot clear an item's tags through the Web API. Remove the tags in Steamworks or on the Workshop page instead. No request was sent.",
            ),
          );
        }
        if (title === undefined && file_description === undefined && visibility === undefined && !tags) {
          return errorResponse(
            new Error(
              "Nothing to update: pass at least one of title, file_description, visibility, or tags. No request was sent.",
            ),
          );
        }

        const dryRun = dry_run !== false;
        const blocked = refuseIfUnconfirmed(dryRun, confirm);
        if (blocked) return refusal(blocked);

        const params: Record<string, string | number | boolean | undefined> = {
          publishedfileid,
          appid,
          title,
          file_description,
          visibility,
        };

        if (tags) {
          tags.forEach((tag, i) => {
            params[`tags[${i}]`] = tag;
          });
        }

        if (dryRun) {
          return dryRunResponse("steam_updateWorkshopItem", {
            method: "POST",
            endpoint: "/IPublishedFileService/UpdateDetails/v1/",
            params,
          });
        }

        const key = requireApiKey();

        const data = (await steamPartnerPost(
          "/IPublishedFileService/UpdateDetails/v1/",
          {
            key,
            ...params,
          },
        )) as { response?: unknown } | null;

        // Service methods report failure through the HTTP status (handled by
        // steamFetch); a success always carries a `response` object.
        if (!data || typeof data.response !== "object" || data.response === null) {
          return errorResponse(
            new Error(
              `Failed to update Workshop item ${publishedfileid} for app ${appid}. Steam returned no response object. Verify the item belongs to this app and the API key has publisher access.`,
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
                  publishedfileid,
                  appid,
                  updated: [
                    ...(["title", "file_description", "visibility"] as const).filter((k) => params[k] !== undefined),
                    ...(tags ? ["tags"] : []),
                  ],
                  response: data.response,
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
