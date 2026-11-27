import { describe, it, expect, vi, afterEach } from "vitest";
import { registeredTools } from "./harness.js";

const compare = registeredTools().get("steam_compareApps")!.handler;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("steam_compareApps store errors (#119)", () => {
  it("reports the real cause when an app's store call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname === "/api/appdetails") {
          const appid = u.searchParams.get("appids")!;
          if (appid === "400") return new Response("oops", { status: 500 });
          return new Response(JSON.stringify({ [appid]: { success: true, data: { name: "Portal 2" } } }));
        }
        return new Response(JSON.stringify({}));
      }),
    );

    const { apps } = JSON.parse((await compare({ appids: [620, 400], cc: "US" })).content[0].text);
    expect(apps[0].name).toBe("Portal 2");
    expect(apps[1].error).toMatch(/^Store data unavailable: /);
    expect(apps[1].error).not.toContain("delisted");
  });

  it("keeps the delisted wording when the store answers without data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        const appid = u.searchParams.get("appids");
        if (u.pathname === "/api/appdetails") {
          const entry = appid === "400" ? { success: false } : { success: true, data: { name: "Portal 2" } };
          return new Response(JSON.stringify({ [appid!]: entry }));
        }
        return new Response(JSON.stringify({}));
      }),
    );

    const { apps } = JSON.parse((await compare({ appids: [620, 400], cc: "US" })).content[0].text);
    expect(apps[1].error).toContain("delisted");
  });
});
