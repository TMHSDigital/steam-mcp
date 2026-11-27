import { steamApiUrl, steamFetch } from "./steam-api.js";

// Top user tags ("Roguelike Deckbuilder", "Cozy"), which store appdetails does
// not return. Both endpoints are public and keyless but lightly documented;
// scripts/contract-check.mjs watches them (#118).

const TOP_TAGS = 10;

interface StoreItem {
  appid?: number;
  success?: number;
  tags?: Array<{ tagid: number; weight?: number }>;
}

/** Each app's top user tags by weight, from IStoreBrowseService/GetItems and IStoreService/GetTagList. */
export async function topTags(appids: number[], cc = "US"): Promise<Map<number, string[]>> {
  const [items, list] = await Promise.all([
    steamFetch(
      steamApiUrl("/IStoreBrowseService/GetItems/v1/", {
        input_json: JSON.stringify({
          ids: appids.map((appid) => ({ appid })),
          context: { country_code: cc, language: "english" },
          data_request: { include_tag_count: 20 },
        }),
      }),
    ) as Promise<{ response?: { store_items?: StoreItem[] } }>,
    steamFetch(steamApiUrl("/IStoreService/GetTagList/v1/", { language: "english" })) as Promise<{
      response?: { tags?: Array<{ tagid: number; name: string }> };
    }>,
  ]);
  const names = new Map((list.response?.tags ?? []).map((t) => [t.tagid, t.name]));
  const out = new Map<number, string[]>();
  for (const item of items.response?.store_items ?? []) {
    if (item.success !== 1 || item.appid === undefined || !item.tags) continue;
    const tags = [...item.tags]
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .map((t) => names.get(t.tagid))
      .filter((n): n is string => Boolean(n))
      .slice(0, TOP_TAGS);
    if (tags.length) out.set(item.appid, tags);
  }
  return out;
}

/** topTags, or an empty map when either lookup fails: tags are extra detail, never a reason to fail. */
export async function topTagsOrNone(appids: number[], cc?: string): Promise<Map<number, string[]>> {
  try {
    return await topTags(appids, cc);
  } catch {
    return new Map();
  }
}
