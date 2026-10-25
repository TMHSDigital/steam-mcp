import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import { stripHtml, truncate } from "../utils/text.js";

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
  detail: z
    .enum(["summary", "full"])
    .optional()
    .describe(
      "summary (default): name, type, price, release date, genres, categories, platforms, metacritic, recommendations, and the short description, about 2 KB. full: every store field, about 30 KB.",
    ),
  fields: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Return only these raw store fields (e.g. [\"pc_requirements\", \"dlc\", \"screenshots\"]). Overrides detail.",
    ),
  include_html: z
    .boolean()
    .optional()
    .describe(
      "Keep store HTML in description and requirements fields (default: false, which strips tags and truncates long text to 2000 chars).",
    ),
};

export type AppData = Record<string, unknown>;

const MAX_TEXT = 2000;

function descriptions(list: unknown): string[] | undefined {
  return Array.isArray(list)
    ? list.map((x) => (x as { description?: string }).description ?? "").filter(Boolean)
    : undefined;
}

export function summarize(d: AppData): AppData {
  const releaseDate = d.release_date as { coming_soon?: boolean; date?: string } | undefined;
  return {
    steam_appid: d.steam_appid,
    name: d.name,
    type: d.type,
    is_free: d.is_free,
    short_description:
      typeof d.short_description === "string" ? stripHtml(d.short_description) : undefined,
    developers: d.developers,
    publishers: d.publishers,
    price_overview: d.price_overview,
    release_date: releaseDate,
    genres: descriptions(d.genres),
    categories: descriptions(d.categories),
    platforms: d.platforms,
    metacritic: d.metacritic,
    recommendations: (d.recommendations as { total?: number } | undefined)?.total,
    achievements: (d.achievements as { total?: number } | undefined)?.total,
    dlc_count: Array.isArray(d.dlc) ? d.dlc.length : undefined,
    required_age: d.required_age,
    controller_support: d.controller_support,
    supported_languages:
      typeof d.supported_languages === "string"
        ? truncate(stripHtml(d.supported_languages), 500)
        : undefined,
    header_image: d.header_image,
    website: d.website,
  };
}

/** Strip HTML from string values (and requirement objects) unless the caller wants it. */
function cleanHtml(value: unknown): unknown {
  if (typeof value === "string") {
    return /<[a-z/][^>]*>/i.test(value) ? truncate(stripHtml(value), MAX_TEXT) : value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanHtml(v)]));
  }
  return value;
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getAppDetails",
    {
      title: "Get App Details",
      description:
        "Get Steam store data for an app. Returns a compact summary by default (price, release date, genres, platforms, metacritic, short description). Pass detail: \"full\" or a fields list for descriptions, requirements, screenshots, DLC, and the rest. No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid, cc, l, detail, fields, include_html }) => {
      try {
        const url = steamStoreUrl("/api/appdetails", {
          appids: appid,
          cc,
          l,
        });

        const data = (await steamFetch(url)) as Record<
          string,
          { success: boolean; data?: AppData }
        >;

        const entry = data[String(appid)];
        if (!entry || !entry.success || !entry.data) {
          return errorResponse(
            new Error(
              `App ${appid} data is not available in the Steam store. The app may not exist, or it may be region-locked.`,
            ),
          );
        }

        let out: AppData;
        if (fields?.length) {
          out = { steam_appid: entry.data.steam_appid };
          for (const f of fields) out[f] = entry.data[f];
        } else if (detail === "full") {
          out = entry.data;
        } else {
          out = summarize(entry.data);
        }
        if (!include_html) {
          out = cleanHtml(out) as AppData;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(out) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
