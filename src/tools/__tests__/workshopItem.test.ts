import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools, jsonFetch } from "./harness.js";

const tool = registeredTools().get("steam_getWorkshopItem")!.handler;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("steam_getWorkshopItem with publishedfileids (#140)", () => {
  it("fetches every ID in one POST and lists the missing ones", async () => {
    const fetchMock = vi.fn(
      jsonFetch({
        response: {
          publishedfiledetails: [
            { result: 1, publishedfileid: "111", title: "Map A", description: "x".repeat(1500), subscriptions: 10 },
            { result: 9, publishedfileid: "222" },
            { result: 1, publishedfileid: "333", title: "Map C", description: "short", subscriptions: 3 },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await tool({ publishedfileids: ["111", "222", "333", "111"] });
    expect(result.isError).toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      itemcount: "3",
      "publishedfileids[0]": "111",
      "publishedfileids[1]": "222",
      "publishedfileids[2]": "333",
    });

    const body = JSON.parse(result.content[0].text);
    expect(body.not_found).toEqual(["222"]);
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Map A", "Map C"]);
    expect(body.items[0].description).toMatch(/\[truncated, 1500 chars\]$/);
    expect(body.items[1].description).toBe("short");
    // One warning for the whole list, placed before the user-authored items.
    expect(result.content[0].text.match(/_warning/g)).toHaveLength(1);
    expect(Object.keys(body)).toEqual(["not_found", "_warning", "items"]);
  });

  it("keeps the single-item request and output unchanged", async () => {
    const fetchMock = vi.fn(
      jsonFetch({ response: { publishedfiledetails: [{ result: 1, publishedfileid: "111", title: "Map A", description: "d" }] } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await tool({ publishedfileid: "111" });
    expect(new URLSearchParams(String(fetchMock.mock.calls[0][1]!.body)).toString()).toBe(
      "itemcount=1&publishedfileids%5B0%5D=111",
    );
    expect(Object.keys(JSON.parse(result.content[0].text))).toEqual(["result", "publishedfileid", "_warning", "title", "description"]);
  });

  it("rejects both or neither of publishedfileid and publishedfileids", async () => {
    vi.stubGlobal("fetch", vi.fn());
    for (const args of [{}, { publishedfileid: "1", publishedfileids: ["1"] }]) {
      const result = await tool(args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/either publishedfileid .* or publishedfileids/);
    }
  });
});
