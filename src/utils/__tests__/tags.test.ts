import { describe, it, expect, vi, afterEach } from "vitest";
import { topTags, topTagsOrNone } from "../tags.js";
import { registeredTools } from "../../tools/__tests__/harness.js";

// Top user tags from IStoreBrowseService/GetItems + IStoreService/GetTagList (#118).
const TAG_LIST = { response: { tags: [{ tagid: 1, name: "Puzzle" }, { tagid: 2, name: "Co-op" }, { tagid: 3, name: "Sci-fi" }] } };
const ITEMS = {
  response: {
    store_items: [
      { appid: 620, success: 1, tags: [{ tagid: 3, weight: 10 }, { tagid: 1, weight: 30 }, { tagid: 99, weight: 25 }, { tagid: 2, weight: 20 }] },
      { appid: 400, success: 1, tags: [{ tagid: 1, weight: 5 }] },
      { appid: 7, success: 0 },
    ],
  },
};

/** Answers the two tag endpoints and the store appdetails call; anything else is {}. */
function steam(details: Record<string, unknown> = {}, failTags = false) {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.includes("GetTagList")) return failTags ? new Response("", { status: 500 }) : new Response(JSON.stringify(TAG_LIST));
    if (url.pathname.includes("GetItems")) return new Response(JSON.stringify(ITEMS));
    if (url.pathname === "/api/appdetails") {
      const appid = url.searchParams.get("appids")!;
      return new Response(JSON.stringify({ [appid]: { success: true, data: { name: `App ${appid}`, ...details } } }));
    }
    return new Response(JSON.stringify({}));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("topTags", () => {
  it("orders by weight, names the tags, and skips unknown ids and failed items", async () => {
    const fetchMock = steam();
    vi.stubGlobal("fetch", fetchMock);
    const tags = await topTags([620, 400, 7], "DE");
    expect(tags.get(620)).toEqual(["Puzzle", "Co-op", "Sci-fi"]);
    expect(tags.get(400)).toEqual(["Puzzle"]);
    expect(tags.has(7)).toBe(false);

    const items = fetchMock.mock.calls.map((c) => new URL(c[0])).find((u) => u.pathname.includes("GetItems"))!;
    expect(JSON.parse(items.searchParams.get("input_json")!)).toMatchObject({
      ids: [{ appid: 620 }, { appid: 400 }, { appid: 7 }],
      context: { country_code: "DE" },
      data_request: { include_tag_count: 20 },
    });
    expect(items.searchParams.has("key")).toBe(false);
  });

  it("topTagsOrNone returns an empty map when a lookup fails", async () => {
    vi.stubGlobal("fetch", steam({}, true));
    expect((await topTagsOrNone([620])).size).toBe(0);
  });
});

describe("tags in tool output", () => {
  const tools = registeredTools();

  it("steam_compareApps adds each app's tags", async () => {
    vi.stubGlobal("fetch", steam());
    const { apps } = JSON.parse((await tools.get("steam_compareApps")!.handler({ appids: [620, 400] })).content[0].text);
    expect(apps[0].tags).toEqual(["Puzzle", "Co-op", "Sci-fi"]);
    expect(apps[1].tags).toEqual(["Puzzle"]);
  });

  it("steam_getAppDetails adds tags to the summary only", async () => {
    vi.stubGlobal("fetch", steam({ steam_appid: 620 }));
    const summary = JSON.parse((await tools.get("steam_getAppDetails")!.handler({ appid: 620 })).content[0].text);
    expect(summary.tags).toEqual(["Puzzle", "Co-op", "Sci-fi"]);

    const fetchMock = steam({ steam_appid: 620 });
    vi.stubGlobal("fetch", fetchMock);
    const full = JSON.parse((await tools.get("steam_getAppDetails")!.handler({ appid: 620, detail: "full" })).content[0].text);
    expect(full).not.toHaveProperty("tags");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("steam_getAppDetails still answers when the tag lookup fails", async () => {
    vi.stubGlobal("fetch", steam({ steam_appid: 620 }, true));
    const result = await tools.get("steam_getAppDetails")!.handler({ appid: 620 });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).not.toHaveProperty("tags");
  });
});
