import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerToolsets, selectToolsets, TOOLSETS, TOOLSET_NAMES } from "../index.js";
import { registeredTools } from "./harness.js";

function namesFor(toolsets: Parameters<typeof registerToolsets>[1]): string[] {
  const names: string[] = [];
  registerToolsets({ registerTool: (name: string) => names.push(name) } as unknown as McpServer, toolsets);
  return names;
}

describe("toolsets", () => {
  it("cover every tool exactly once", () => {
    const all = namesFor(TOOLSET_NAMES);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual([...registeredTools().keys()].sort());
  });

  it("mutations holds exactly the confirm-gated tools", () => {
    const gated = [...registeredTools().values()]
      .filter((t) => "confirm" in t.inputSchema)
      .map((t) => t.name)
      .sort();
    expect(namesFor(["mutations"]).sort()).toEqual(gated);
  });

  it("default excludes live-mutation tools", () => {
    const { enabled } = selectToolsets({});
    expect(enabled).not.toContain("mutations");
    expect(enabled).toHaveLength(TOOLSET_NAMES.length - 1);
  });

  it("parses a list, ignores case and whitespace, and reports unknown names", () => {
    expect(selectToolsets({ STEAM_MCP_TOOLSETS: " Store, assets ,bogus" })).toEqual({
      enabled: ["store", "assets"],
      unknown: ["bogus"],
    });
  });

  it("all enables everything, and READ_ONLY still removes mutations", () => {
    expect(selectToolsets({ STEAM_MCP_TOOLSETS: "all" }).enabled).toEqual(TOOLSET_NAMES);
    expect(
      selectToolsets({ STEAM_MCP_TOOLSETS: "all", STEAM_MCP_READ_ONLY: "1" }).enabled,
    ).not.toContain("mutations");
  });

  it("every toolset is non-empty", () => {
    for (const [name, registrars] of Object.entries(TOOLSETS)) {
      expect(registrars.length, name).toBeGreaterThan(0);
    }
  });
});
