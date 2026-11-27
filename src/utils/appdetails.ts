import { steamFetch, steamStoreUrl } from "./steam-api.js";

// The store appdetails envelope, { [appid]: { success, data } }, parsed in one
// place (#127). success: false means Steam has no store data for the app in
// that region (missing, delisted, or region-locked).

export type AppDetailsEntry<T> = { ok: true; data?: T } | { ok: false };

export interface AppDetailsOptions {
  cc?: string;
  l?: string;
  filters?: string;
}

/** GET /api/appdetails for one or more appids (one request) and unwrap each app's entry. */
export async function fetchAppDetails<T = Record<string, unknown>>(
  appids: readonly number[],
  { cc, l, filters }: AppDetailsOptions = {},
): Promise<Map<number, AppDetailsEntry<T>>> {
  const body = (await steamFetch(steamStoreUrl("/api/appdetails", { appids: appids.join(","), cc, l, filters }))) as
    | Record<string, { success?: boolean; data?: T } | undefined>
    | null;
  return new Map(
    appids.map((id): [number, AppDetailsEntry<T>] => {
      const entry = body?.[String(id)];
      return [id, entry?.success ? { ok: true, data: entry.data } : { ok: false }];
    }),
  );
}

/** The app's store data, or undefined when Steam has none. */
export function appData<T>(entry: AppDetailsEntry<T> | undefined): T | undefined {
  return entry?.ok ? entry.data : undefined;
}

/**
 * The shared price result: Steam's price_overview, "no price listed" (free,
 * unreleased, or not sold), or `unavailable` when Steam has no entry.
 */
export function classifyPrice(
  entry: AppDetailsEntry<{ price_overview?: unknown }> | undefined,
  unavailable: string,
): unknown {
  if (!entry?.ok) return { error: unavailable };
  if (!entry.data?.price_overview) return { price_overview: null, reason: "no_price_listed" };
  return entry.data.price_overview;
}
