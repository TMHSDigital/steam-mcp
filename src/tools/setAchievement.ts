import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerPost,
  requireApiKey,
  errorResponse,
  eresultOf,
  publisherErrorResponse,
} from "../utils/steam-api.js";
import {
  confirmSchema,
  refuseIfUnconfirmed,
  refusal,
  dryRunResponse,
} from "../utils/confirm.js";

const inputSchema = {
  steamid: z
    .string()
    .regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID")
    .describe("64-bit Steam ID of the player"),
  appid: z
    .number()
    .int()
    .positive()
    .describe("Steam application ID"),
  achievement: z
    .string()
    .min(1)
    .describe(
      "Achievement API name (e.g. ACH_BEAT_LEVEL_1). Must match a name configured in Steamworks.",
    ),
  ...confirmSchema,
};

export function register(server: McpServer): void {
  server.tool(
    "steam_setAchievement",
    "MUTATES LIVE ACHIEVEMENT STATE. Default dry_run=true; requires confirm=true to send. Set (unlock) an achievement for a player via the partner API. Intended for dev/test use. Requires a publisher API key with server IP allowlisted in Steamworks partner settings.",
    inputSchema,
    async ({ steamid, appid, achievement, dry_run, confirm }) => {
      try {
        const dryRun = dry_run !== false;
        const blocked = refuseIfUnconfirmed(dryRun, confirm);
        if (blocked) return refusal(blocked);

        const params = {
          steamid,
          appid,
          count: 1,
          "name[0]": achievement,
          "value[0]": 1,
        };

        if (dryRun) {
          return dryRunResponse("steam_setAchievement", {
            method: "POST",
            endpoint: "/ISteamUserStats/SetUserStatsForGame/v1/",
            params,
          });
        }

        const key = requireApiKey();

        const data = await steamPartnerPost(
          "/ISteamUserStats/SetUserStatsForGame/v1/",
          {
            key,
            ...params,
          },
        );

        const eresult = eresultOf(data);
        if (eresult !== 1) {
          return errorResponse(
            new Error(
              `Failed to set achievement '${achievement}' for Steam ID ${steamid} (EResult ${eresult ?? "missing"}). Verify the achievement API name exists in your Steamworks configuration and the API key has publisher access.`,
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
                  steamid,
                  appid,
                  achievement,
                  message: `Achievement '${achievement}' set for player ${steamid}.`,
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
