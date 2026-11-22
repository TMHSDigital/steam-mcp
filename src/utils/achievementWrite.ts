import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  steamPartnerPost,
  requireApiKey,
  errorResponse,
  eresultOf,
  publisherErrorResponse,
} from "./steam-api.js";
import { confirmSchema, refuseIfUnconfirmed, refusal, dryRunResponse } from "./confirm.js";
import { LIVE_WRITE_IDEMPOTENT } from "./annotations.js";

// steam_setAchievement and steam_clearAchievement differ only in the value
// they write (1 or 0) and their wording. Both send SetUserStatsForGame with
// count + name[n]/value[n], so several achievements fit in one call.

/** SetUserStatsForGame takes indexed names; keep one confirmed call reviewable. */
export const MAX_ACHIEVEMENTS_PER_CALL = 100;

const achievementName = z.string().min(1);

const inputSchema = {
  steamid: z
    .string()
    .regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID")
    .describe("64-bit Steam ID of the player"),
  appid: z.number().int().positive().describe("Steam application ID"),
  achievement: achievementName
    .optional()
    .describe(
      "Achievement API name (e.g. ACH_BEAT_LEVEL_1). Must match a name configured in Steamworks. Pass this or achievements.",
    ),
  achievements: z
    .array(achievementName)
    .min(1)
    .max(MAX_ACHIEVEMENTS_PER_CALL)
    .optional()
    .describe(
      `Several achievement API names changed in one dry run and one confirmed call (1-${MAX_ACHIEVEMENTS_PER_CALL}). Pass this or achievement.`,
    ),
  ...confirmSchema,
};

export interface AchievementWriteSpec {
  name: string;
  title: string;
  /** "set" or "clear", used in messages. */
  verb: "set" | "clear";
  /** Value written to every achievement: 1 unlocks, 0 re-locks. */
  value: 0 | 1;
  description: string;
}

export function registerAchievementWrite(server: McpServer, spec: AchievementWriteSpec): void {
  const past = spec.verb === "set" ? "set" : "cleared";
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema,
      annotations: LIVE_WRITE_IDEMPOTENT,
    },
    async ({ steamid, appid, achievement, achievements, dry_run, confirm }) => {
      try {
        const dryRun = dry_run !== false;
        const blocked = refuseIfUnconfirmed(dryRun, confirm);
        if (blocked) return refusal(blocked);

        if ((achievement === undefined) === (achievements === undefined)) {
          return errorResponse(
            new Error("Pass either achievement (one name) or achievements (a list), not both. No request was sent."),
          );
        }
        // Duplicates would only repeat the same write; keep the first of each.
        const names = achievement !== undefined ? [achievement] : [...new Set(achievements)];

        const params: Record<string, string | number> = { steamid, appid, count: names.length };
        names.forEach((n, i) => {
          params[`name[${i}]`] = n;
          params[`value[${i}]`] = spec.value;
        });

        if (dryRun) {
          return dryRunResponse(spec.name, {
            method: "POST",
            endpoint: "/ISteamUserStats/SetUserStatsForGame/v1/",
            achievements: names,
            params,
          });
        }

        const key = requireApiKey();
        const data = await steamPartnerPost("/ISteamUserStats/SetUserStatsForGame/v1/", { key, ...params });

        const label = names.length === 1 ? `achievement '${names[0]}'` : `${names.length} achievements`;
        const eresult = eresultOf(data);
        if (eresult !== 1) {
          return errorResponse(
            new Error(
              `Failed to ${spec.verb} ${label} for Steam ID ${steamid} (EResult ${eresult ?? "missing"}). Verify the achievement API names exist in your Steamworks configuration and the API key has publisher access.`,
            ),
          );
        }

        const message =
          names.length === 1
            ? `Achievement '${names[0]}' ${past} for player ${steamid}.`
            : `${names.length} achievements ${past} for player ${steamid}.`;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  steamid,
                  appid,
                  ...(achievement !== undefined ? { achievement } : { achievements: names }),
                  message,
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
