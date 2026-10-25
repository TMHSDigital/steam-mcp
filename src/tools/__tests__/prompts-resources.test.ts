import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "../../prompts.js";
import { registerResources } from "../../resources.js";
import { registeredTools } from "./harness.js";

type PromptCb = (args: Record<string, string>) => { messages: Array<{ content: { text: string } }> };
type ResourceCb = (uri: URL, vars?: Record<string, string>) => Promise<{ contents: Array<{ text: string }> }> | { contents: Array<{ text: string }> };

const prompts = new Map<string, { argsSchema: z.ZodRawShape; cb: PromptCb }>();
const resources = new Map<string, ResourceCb>();

registerPrompts({
  registerPrompt(name: string, config: { argsSchema: z.ZodRawShape }, cb: PromptCb) {
    prompts.set(name, { argsSchema: config.argsSchema, cb });
  },
} as unknown as McpServer);

registerResources({
  registerResource(_name: string, uri: string | { uriTemplate: { toString(): string } }, _meta: unknown, cb: ResourceCb) {
    resources.set(typeof uri === "string" ? uri : uri.uriTemplate.toString(), cb);
  },
} as unknown as McpServer);

const toolNames = new Set(registeredTools().keys());

describe("prompts", () => {
  it("registers the workflow prompts", () => {
    expect([...prompts.keys()].sort()).toEqual(
      ["achievement-health", "competitor-snapshot", "launch-readiness", "regional-price-audit", "review-digest", "workshop-health"],
    );
  });

  it.each([
    ["competitor-snapshot", { appids: "413150,1145360" }],
    ["achievement-health", { appid: "440" }],
    ["review-digest", { appid: "440" }],
    ["regional-price-audit", { appid: "440" }],
    ["workshop-health", { appid: "4000" }],
    ["launch-readiness", { dir: "./art", appid: "620" }],
  ])("%s only names tools that exist", (name, args) => {
    const prompt = prompts.get(name)!;
    expect(z.object(prompt.argsSchema).safeParse(args).success).toBe(true);
    const text = prompt.cb(args).messages[0].content.text;
    const mentioned = text.match(/steam_\w+/g) ?? [];
    expect(mentioned.length).toBeGreaterThan(0);
    for (const tool of mentioned) {
      expect(toolNames.has(tool), tool).toBe(true);
    }
  });

  it("rejects non-numeric appids", () => {
    expect(z.object(prompts.get("achievement-health")!.argsSchema).safeParse({ appid: "abc" }).success).toBe(false);
  });
});

describe("resources", () => {
  it("registers reference data and the app summary template", () => {
    expect([...resources.keys()].sort()).toEqual([
      "steam://app/{appid}/summary",
      "steam://enums/eresult",
      "steam://enums/review-filters",
      "steam://enums/ugc-query-type",
      "steam://specs/store-assets",
    ]);
  });

  it("store-asset specs include every slot with its upload flag", async () => {
    const uri = new URL("steam://specs/store-assets");
    const specs = JSON.parse((await resources.get(uri.href)!(uri)).contents[0].text);
    expect(specs.libraryHero).toMatchObject({ width: 3840, height: 1240, partnerUploadable: true });
    expect(specs.achievementIcon).toMatchObject({ width: 256, partnerUploadable: false });
  });

  it("ugc-query-type matches the values queryWorkshop sends", async () => {
    const uri = new URL("steam://enums/ugc-query-type");
    const types = JSON.parse((await resources.get(uri.href)!(uri)).contents[0].text);
    expect(types.trend).toBe(3);
  });
});
