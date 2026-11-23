import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { renderSite, collectTools, keyNeed, CONFIG_VARS } from "./build.js";

// The site in docs/ is generated from the real registrations. These tests fail
// when the committed pages are stale: run `npm run site` and commit docs/.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("GitHub Pages site", () => {
  it.each(Object.entries(renderSite()))("docs/%s is up to date (run npm run site)", (file, html) => {
    // Normalize line endings so a CRLF checkout on Windows still compares equal.
    expect(read(`../docs/${file}`).replace(/\r\n/g, "\n")).toBe(html);
  });

  it("every tool states which key it needs", () => {
    const tools = collectTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) expect(t.key).toBeTruthy();
  });

  it("refuses a tool whose description names no key", () => {
    expect(() => keyNeed("store", "steam_x", "Does a thing.")).toThrow(/steam_x/);
  });

  it("only documents settings that exist in .env.example", () => {
    const example = read("../.env.example");
    for (const [name] of CONFIG_VARS) expect(example).toContain(name);
  });
});
