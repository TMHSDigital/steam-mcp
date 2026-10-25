import { describe, it, expect } from "vitest";
import type { z } from "zod";
import { registeredTools } from "./harness.js";

// Validates the schemas the tools actually register, not copies of them.

const tools = registeredTools();

function field(tool: string, key: string): z.ZodTypeAny {
  const schema = tools.get(tool)?.inputSchema[key];
  if (!schema) throw new Error(`${tool} has no input field ${key}`);
  return schema as z.ZodTypeAny;
}

const ok = (schema: z.ZodTypeAny, value: unknown) => schema.safeParse(value).success;

describe("Steam ID validation (steam_getPlayerSummary.steamid)", () => {
  const steamid = field("steam_getPlayerSummary", "steamid");

  it("accepts a valid 17-digit ID", () => {
    expect(ok(steamid, "76561197960435530")).toBe(true);
  });

  it.each(["", "abcdefghijklmnopq", "12345", "123456789012345678", "7656119796043 530"])(
    "rejects %j",
    (value) => {
      expect(ok(steamid, value)).toBe(false);
    },
  );

  it("is the same rule on every tool that takes a steamid", () => {
    for (const tool of tools.values()) {
      const schema = tool.inputSchema.steamid as z.ZodTypeAny | undefined;
      if (!schema) continue;
      expect(ok(schema, "12345"), tool.name).toBe(false);
      expect(ok(schema, "76561197960435530"), tool.name).toBe(true);
    }
  });
});

describe("Published file ID validation (steam_getWorkshopItem.publishedfileid)", () => {
  const id = field("steam_getWorkshopItem", "publishedfileid");

  it("accepts numeric strings", () => {
    expect(ok(id, "814498849")).toBe(true);
    expect(ok(id, "99999999999")).toBe(true);
  });

  it.each(["", "abc123", "123-456"])("rejects %j", (value) => {
    expect(ok(id, value)).toBe(false);
  });
});

describe("App ID validation (every tool's appid)", () => {
  const withAppid = [...tools.values()].filter((t) => t.inputSchema.appid);

  it("covers most tools", () => {
    expect(withAppid.length).toBeGreaterThan(15);
  });

  it.each([0, -1, 1.5, "440"])("rejects %j everywhere", (value) => {
    for (const tool of withAppid) {
      expect(ok(tool.inputSchema.appid as z.ZodTypeAny, value), tool.name).toBe(false);
    }
  });

  it("accepts 440 everywhere", () => {
    for (const tool of withAppid) {
      expect(ok(tool.inputSchema.appid as z.ZodTypeAny, 440), tool.name).toBe(true);
    }
  });
});

describe("Leaderboard datarequest (steam_getLeaderboardEntries.datarequest)", () => {
  const datarequest = field("steam_getLeaderboardEntries", "datarequest");

  it("accepts 0-2 and omission", () => {
    for (const v of [0, 1, 2, undefined]) expect(ok(datarequest, v)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(ok(datarequest, 3)).toBe(false);
    expect(ok(datarequest, -1)).toBe(false);
  });
});

describe("Vanity URL (steam_resolveVanityURL)", () => {
  const vanityurl = field("steam_resolveVanityURL", "vanityurl");
  const urlType = field("steam_resolveVanityURL", "url_type");

  it("requires a non-empty vanity URL", () => {
    expect(ok(vanityurl, "gabelogannewell")).toBe(true);
    expect(ok(vanityurl, "")).toBe(false);
  });

  it("url_type accepts 1-3 only", () => {
    for (const v of [1, 2, 3]) expect(ok(urlType, v)).toBe(true);
    expect(ok(urlType, 0)).toBe(false);
    expect(ok(urlType, 4)).toBe(false);
  });
});

describe("Workshop query (steam_queryWorkshop)", () => {
  const numperpage = field("steam_queryWorkshop", "numperpage");
  const sort = field("steam_queryWorkshop", "sort");
  const requiredtags = field("steam_queryWorkshop", "requiredtags");

  it("numperpage is 1-100", () => {
    for (const v of [1, 50, 100]) expect(ok(numperpage, v)).toBe(true);
    expect(ok(numperpage, 0)).toBe(false);
    expect(ok(numperpage, 101)).toBe(false);
  });

  it("sort is a named enum, not a raw integer", () => {
    expect(ok(sort, "trend")).toBe(true);
    expect(ok(sort, 2)).toBe(false);
  });

  it("requiredtags is an array, not a comma string", () => {
    expect(ok(requiredtags, ["Map", "Addon"])).toBe(true);
    expect(ok(requiredtags, "Map,Addon")).toBe(false);
  });
});

describe("Write tools confirm flags", () => {
  it("every gated tool takes boolean dry_run and confirm", () => {
    const gated = [...tools.values()].filter((t) => "confirm" in t.inputSchema);
    expect(gated.length).toBe(5);
    for (const tool of gated) {
      expect(ok(tool.inputSchema.confirm as z.ZodTypeAny, "yes"), tool.name).toBe(false);
      expect(ok(tool.inputSchema.dry_run as z.ZodTypeAny, true), tool.name).toBe(true);
    }
  });
});
