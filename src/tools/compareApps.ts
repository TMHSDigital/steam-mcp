import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamApiUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { fetchAppReviews } from "../utils/reviews.js";
import { READ_ONLY } from "../utils/annotations.js";
import { stripHtml } from "../utils/text.js";

const inputSchema = {
  appids: z.array(z.number().int().positive()).min(2).max(10).describe("Steam appids to compare (2-10)"),
  cc: z.string().length(2).optional().describe("Two-letter country code for prices (default: US)"),
};

type Details = {
  name?: string;
  is_free?: boolean;
  price_overview?: { final_formatted?: string; discount_percent?: number };
  release_date?: { date?: string; coming_soon?: boolean };
  genres?: Array<{ description: string }>;
  metacritic?: { score?: number };
  supported_languages?: string;
  developers?: string[];
};

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch {
    return undefined;
  }
}

async function compareOne(appid: number, cc: string) {
  const [details, reviews, players] = await Promise.all([
    settle(steamFetch(steamStoreUrl("/api/appdetails", { appids: appid, cc })) as Promise<
      Record<string, { success: boolean; data?: Details }>
    >),
    settle(fetchAppReviews({ appid, languages: ["all"], purchase_type: "all", num_per_page: 1 })),
    settle(
      steamFetch(steamApiUrl("/ISteamUserStats/GetNumberOfCurrentPlayers/v1/", { appid })) as Promise<{
        response?: { player_count?: number };
      }>,
    ),
  ]);

  const d = details?.[String(appid)]?.data;
  const s = reviews?.query_summary;
  const languages = d?.supported_languages
    ? stripHtml(d.supported_languages).split(/,\s*/).map((l) => l.replace(/\*$/, "").trim()).filter(Boolean)
    : undefined;

  return {
    appid,
    name: d?.name,
    developer: d?.developers?.[0],
    price: d?.is_free ? "free" : (d?.price_overview?.final_formatted ?? (d ? "no price listed" : undefined)),
    discount_percent: d?.price_overview?.discount_percent || undefined,
    release_date: d?.release_date?.coming_soon ? `coming soon (${d.release_date.date})` : d?.release_date?.date,
    genres: d?.genres?.map((g) => g.description),
    metacritic: d?.metacritic?.score,
    review_score: s?.review_score_desc,
    review_positive_pct:
      s?.total_reviews ? Math.round(((s.total_positive ?? 0) / s.total_reviews) * 100) : undefined,
    review_count: s?.total_reviews,
    current_players: players?.response?.player_count,
    language_count: languages?.length,
    ...(d ? {} : { error: "Store data unavailable (app missing, delisted, or region-locked)" }),
  };
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_compareApps",
    {
      title: "Compare Apps",
      description:
        "Compare 2-10 Steam apps in one compact table: price, discount, release date, genres, metacritic, review score and count, current players, and language count. No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appids, cc }) => {
      try {
        const rows = await Promise.all(appids.map((id) => compareOne(id, cc ?? "US")));
        if (rows.every((r) => "error" in r)) {
          return errorResponse(
            new Error(`No store data for any of ${appids.join(", ")}. Steam may be unavailable, or the apps are delisted or region-locked.`),
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ region: cc ?? "US", apps: rows }) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
