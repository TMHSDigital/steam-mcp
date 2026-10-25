import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appids: z
    .array(z.number().int().positive())
    .min(1)
    .max(20)
    .describe("Steam appids to check (1-20)"),
};

// Values observed from the store's Deck compatibility widget endpoint.
const CATEGORIES: Record<number, string> = { 0: "unknown", 1: "unsupported", 2: "playable", 3: "verified" };
const RESULTS: Record<number, string> = { 1: "note", 2: "fail", 3: "warning", 4: "pass" };

interface ReportItem {
  display_type?: number;
  loc_token?: string;
}

/** "#SteamDeckVerified_TestResult_InterfaceTextIsNotLegible" -> "Interface text is not legible" */
export function describeDeckToken(token: string): string {
  const words = token
    .replace(/^#?[A-Za-z]+_TestResult_/, "")
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return (words.charAt(0).toUpperCase() + words.slice(1))
    .replace(/\bdeck\b/g, "Deck")
    .replace(/\bsteam\b/g, "Steam")
    .replace(/\bsteam os\b/gi, "SteamOS");
}

function tests(items: ReportItem[] | undefined) {
  return (items ?? []).map((i) => ({
    result: RESULTS[i.display_type ?? 0] ?? `type ${i.display_type}`,
    display: describeDeckToken(i.loc_token ?? ""),
  }));
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getDeckCompatibility",
    {
      title: "Get Deck Compatibility",
      description:
        "Get the Steam Deck compatibility category (verified, playable, unsupported, unknown) and each test result in plain language, for up to 20 apps. Uses the store's unofficial Deck report endpoint. No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appids }) => {
      try {
        const reports = [];
        for (const appid of appids) {
          const data = (await steamFetch(
            steamStoreUrl("/saleaction/ajaxgetdeckappcompatibilityreport", { nAppID: appid }),
          )) as {
            success?: number;
            results?: {
              resolved_category?: number;
              resolved_items?: ReportItem[];
              steamos_resolved_category?: number;
              steamos_resolved_items?: ReportItem[];
            };
          };
          const r = data.results;
          if (data.success !== 1 || !r) {
            reports.push({ appid, category: "unknown", error: "No Deck report for this app" });
            continue;
          }
          reports.push({
            appid,
            category: CATEGORIES[r.resolved_category ?? 0] ?? "unknown",
            tests: tests(r.resolved_items),
            steamos: r.steamos_resolved_category !== undefined
              ? {
                  category: CATEGORIES[r.steamos_resolved_category] ?? "unknown",
                  tests: tests(r.steamos_resolved_items),
                }
              : undefined,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                note: "Unofficial store endpoint. Results: pass, warning (why it is only Playable), fail (why it is Unsupported), note.",
                reports,
              }),
            },
          ],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
