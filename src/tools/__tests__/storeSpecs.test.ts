import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import specs from "../../storeAssets/store-specs.json" with { type: "json" };
import {
  REQUIRED_SLOTS,
  SCREENSHOT_RULES,
  SLOT_SPECS,
  SPECS_SOURCES,
  SPECS_VERIFIED,
  STORE_ASSET_SLOTS,
} from "../../storeAssets/slots.js";

// store-specs.json is the single source of Steam store and library image
// sizes (Game-Systems store-specs contract). These tests keep it well formed
// and keep sizes from being copied into code.

const srcDir = new URL("../../", import.meta.url);

function sourceFiles(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !join(e.parentPath, e.name).includes("__tests__"))
    .map((e) => join(e.parentPath, e.name));
}

describe("store-specs.json", () => {
  it("lists every slot exactly once with a well-formed spec", () => {
    expect(specs.slots.map((s) => s.slot).sort()).toEqual([...STORE_ASSET_SLOTS].sort());
    for (const slot of STORE_ASSET_SLOTS) {
      const s = SLOT_SPECS[slot];
      expect(["exact", "logo", "screenshot"], slot).toContain(s.kind);
      expect(s.width, slot).toBeGreaterThan(0);
      expect(s.height, slot).toBeGreaterThan(0);
      expect(s.formats.length, slot).toBeGreaterThan(0);
      for (const f of s.formats) expect(["png", "jpeg"], slot).toContain(f);
    }
  });

  it("records when and where the numbers were checked", () => {
    expect(SPECS_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SPECS_SOURCES.length).toBeGreaterThan(0);
    for (const url of SPECS_SOURCES) expect(url).toMatch(/^https:\/\/partner\.steamgames\.com\/doc\//);
  });

  it("marks the store-page launch set as required", () => {
    expect(REQUIRED_SLOTS).toEqual([
      "headerCapsule",
      "smallCapsule",
      "mainCapsule",
      "verticalCapsule",
      "libraryCapsule",
      "libraryHero",
      "libraryLogo",
    ]);
    expect(SCREENSHOT_RULES.minCount).toBeLessThanOrEqual(SCREENSHOT_RULES.recommendedCount);
  });

  it("is the only place a slot size appears in the source", () => {
    // Sizes distinctive enough that they only mean a store slot.
    const distinctive = new Set<number>();
    for (const s of Object.values(SLOT_SPECS)) {
      for (const n of [s.width, s.height]) if (n >= 170 && ![256, 1080, 1920].includes(n)) distinctive.add(n);
    }
    // Not \b: digits and "x" are both word characters, so \b misses "184x184" (#128).
    const pattern = new RegExp(`(?<!\\d)(${[...distinctive].join("|")})(?!\\d)`);
    // The code that handles store art: asset validation, the asset tools, the
    // Partner uploader, and the resources that publish the specs.
    const artCode = sourceFiles(srcDir).filter((f) =>
      /[\\/](storeAssets|partner)[\\/]|validateStoreAsset|resources\.ts$/.test(f),
    );
    expect(artCode.length).toBeGreaterThan(5);
    const offenders = artCode.filter((file) => pattern.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
