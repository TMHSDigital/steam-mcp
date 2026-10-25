import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../index.js";

// Fails when README, CLAUDE.md, or the package description drift from the
// tools actually registered. Update the docs, not this test.

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

interface Registered {
  name: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
}

const tools: Registered[] = [];
registerAllTools({
  registerTool(name: string, config: Omit<Registered, "name">) {
    tools.push({ name, ...config });
  },
} as unknown as McpServer);

const total = tools.length;
const write = tools.filter((t) => t.inputSchema && "confirm" in t.inputSchema).length;
const sdk = tools.filter((t) => t.title?.includes("(SDK Guide)")).length;
const readOnly = total - write - sdk;

describe("documented tool counts match registrations", () => {
  it("package.json description", () => {
    const { description } = JSON.parse(read("package.json")) as { description: string };
    expect(description).toContain(
      `${total} tools (${readOnly} read, ${write} write, ${sdk} SDK guides)`,
    );
  });

  it("README badge, summary line, and heading", () => {
    const readme = read("README.md");
    expect(readme).toContain(`MCP_tools-${total}-`);
    expect(readme).toContain(
      `<strong>${total} MCP tools</strong> - ${readOnly} read - ${write} write - ${sdk} SDK guides`,
    );
    expect(readme).toContain(`## Available Tools - ${total} Total`);
    expect(readme).toContain(`${write} tools, plus ${sdk} SDK guides`);
  });

  it("README has a table row for every registered tool", () => {
    const readme = read("README.md");
    const missing = tools.filter((t) => !readme.includes(`| \`${t.name}\` |`)).map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it("CLAUDE.md overview", () => {
    expect(read("CLAUDE.md")).toContain(
      `provides ${total} tools: ${readOnly} read-only, ${write} write`,
    );
  });
});
