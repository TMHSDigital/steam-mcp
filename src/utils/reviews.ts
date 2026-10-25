import { steamApiUrl, steamFetch } from "./steam-api.js";

// IUserReviewsService/GetAppReviews replaced store.steampowered.com/appreviews
// on 2026-10-22. It takes the same filters, but as integer enums in input_json.
// https://partner.steamgames.com/doc/webapi/IUserReviewsService

export const REVIEW_FILTERS = { all: 0, recent: 1, updated: 2, funny: 3 } as const;
export const REVIEW_TYPES = { all: 0, positive: 1, negative: 2 } as const;
export const PURCHASE_TYPES = { steam: 0, all: 1, non_steam_purchase: 2 } as const;

export interface AppReviewsQuery {
  appid: number;
  filter?: keyof typeof REVIEW_FILTERS;
  languages?: string[];
  review_type?: keyof typeof REVIEW_TYPES;
  purchase_type?: keyof typeof PURCHASE_TYPES;
  num_per_page?: number;
  cursor?: string;
}

export interface ReviewQuerySummary {
  num_reviews: number;
  review_score?: number;
  review_score_desc?: string;
  total_positive?: number;
  total_negative?: number;
  total_reviews?: number;
}

export interface AppReviewsResponse {
  query_summary?: ReviewQuerySummary;
  reviews?: unknown[];
  cursor?: string;
  total_matching?: number;
  day_range_used?: number;
}

export function buildAppReviewsInput(query: AppReviewsQuery): Record<string, unknown> {
  const input: Record<string, unknown> = { appid: query.appid };
  if (query.filter) input.filter = REVIEW_FILTERS[query.filter];
  if (query.languages?.length) input.languages = query.languages;
  if (query.review_type) input.review_type = REVIEW_TYPES[query.review_type];
  if (query.purchase_type) input.purchase_type = PURCHASE_TYPES[query.purchase_type];
  if (query.num_per_page) input.num_per_page = query.num_per_page;
  if (query.cursor) input.cursor = query.cursor;
  return input;
}

export async function fetchAppReviews(query: AppReviewsQuery): Promise<AppReviewsResponse> {
  const url = steamApiUrl("/IUserReviewsService/GetAppReviews/v1/", {
    input_json: JSON.stringify(buildAppReviewsInput(query)),
  });
  const data = (await steamFetch(url)) as { response?: AppReviewsResponse } | null;
  return data?.response ?? {};
}
