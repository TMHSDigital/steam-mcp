import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools, jsonFetch } from "./harness.js";

// feeds and before (#134).
const news = registeredTools().get("steam_getNewsForApp")!.handler;
const body = { appnews: { appid: 440, newsitems: [{ gid: "1", title: "Patch", feedname: "steam_community_announcements" }] } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("steam_getNewsForApp feeds and before", () => {
  it("sends feeds joined with commas and before as enddate", async () => {
    const fetchMock = vi.fn(jsonFetch(body));
    vi.stubGlobal("fetch", fetchMock);
    const result = await news({ appid: 440, feeds: ["steam_community_announcements", "steam_updates"], before: "2026-06-01" });
    const q = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(q.get("feeds")).toBe("steam_community_announcements,steam_updates");
    expect(q.get("enddate")).toBe(String(Date.UTC(2026, 5, 1) / 1000));
    expect(JSON.parse(result.content[0].text).newsitems[0].feedname).toBe("steam_community_announcements");
  });

  it("sends neither when not given", async () => {
    const fetchMock = vi.fn(jsonFetch(body));
    vi.stubGlobal("fetch", fetchMock);
    await news({ appid: 440 });
    const q = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(q.has("feeds")).toBe(false);
    expect(q.has("enddate")).toBe(false);
  });
});
