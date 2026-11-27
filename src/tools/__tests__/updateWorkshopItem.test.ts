import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools, jsonFetch } from "./harness.js";

// steam_updateWorkshopItem must not send, or report success for, an update
// that changes nothing (#120).
const handler = registeredTools().get("steam_updateWorkshopItem")!.handler;
const LIVE = { publishedfileid: "123", appid: 480, dry_run: false, confirm: true };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("steam_updateWorkshopItem no-op updates (#120)", () => {
  it.each([
    ["tags: []", { tags: [] }, "cannot clear"],
    ["no fields", {}, "Nothing to update"],
  ])("refuses %s without sending, even when confirmed", async (_label, extra, message) => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await handler({ ...LIVE, ...extra });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(message);
    expect(result.content[0].text).toContain("No request was sent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses tags: [] in a dry run too", async () => {
    const result = await handler({ publishedfileid: "123", appid: 480, tags: [] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("cannot clear");
  });

  it("reports tags as one entry in updated", async () => {
    vi.stubEnv("STEAM_API_KEY", "TESTKEY_NOT_REAL");
    vi.stubGlobal("fetch", vi.fn(jsonFetch({ response: {} })));

    const result = await handler({ ...LIVE, title: "New", tags: ["Map", "Addon"] });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).updated).toEqual(["title", "tags"]);
  });
});
