import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { encodePng } from "../../storeAssets/png.js";
import { auditStoreAssetDir, inferSlot } from "../../storeAssets/audit.js";
import { describeDeckToken } from "../getDeckCompatibility.js";

function png(dir: string, name: string, w: number, h: number, alpha = false): string {
  const path = join(dir, name);
  writeFileSync(path, encodePng(w, h, new Uint8Array(w * h * 4).fill(alpha ? 0 : 40), alpha));
  return path;
}

describe("inferSlot", () => {
  const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));

  it.each([
    ["library_hero.png", "libraryHero"],
    ["Hero Capsule.png", "verticalCapsule"],
    ["library-header.png", "libraryHeader"],
    ["header.png", "headerCapsule"],
    ["ss_01.png", "screenshot"],
  ])("%s -> %s by name", (name, slot) => {
    expect(inferSlot(png(dir, name, 10, 10), name)).toEqual({ slot, by: "name" });
  });

  it("falls back to exact size", () => {
    expect(inferSlot(png(dir, "art1.png", 462, 174), "art1.png")).toEqual({ slot: "smallCapsule", by: "size" });
    expect(inferSlot(png(dir, "art2.png", 2560, 1440), "art2.png")).toEqual({ slot: "screenshot", by: "size" });
    expect(inferSlot(png(dir, "art3.png", 33, 33), "art3.png")).toEqual({ by: "none" });
  });
});

describe("auditStoreAssetDir", () => {
  it("reports missing slots, too few screenshots, and unrecognized files", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "header.png", 920, 430);
    png(dir, "small.png", 462, 174);
    png(dir, "main.png", 1000, 700); // wrong size
    png(dir, "ss1.png", 1920, 1080);
    png(dir, "mystery.png", 33, 33);
    writeFileSync(join(dir, "readme.txt"), "ignored");

    const audit = auditStoreAssetDir(dir);
    expect(audit.ok).toBe(false);
    expect(audit.checked).toBe(5);
    expect(audit.missing_slots).toEqual([
      "mainCapsule",
      "verticalCapsule",
      "libraryCapsule",
      "libraryHero",
      "libraryLogo",
    ]);
    expect(audit.screenshots).toEqual({ found: 1, required: 5 });
    expect(audit.unrecognized).toEqual(["mystery.png"]);
    expect(audit.files.find((f) => f.file === "main.png")?.errors[0].code).toBe("SIZE");
  });

  it("passes a complete folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "header.png", 920, 430);
    png(dir, "small.png", 462, 174);
    png(dir, "main.png", 1232, 706);
    png(dir, "vertical.png", 748, 896);
    png(dir, "library_capsule.png", 600, 900);
    png(dir, "library_hero.png", 3840, 1240);
    png(dir, "logo.png", 1280, 400, true);
    for (let i = 1; i <= 5; i++) png(dir, `ss${i}.png`, 1920, 1080);

    const audit = auditStoreAssetDir(dir);
    expect(audit.missing_slots).toEqual([]);
    expect(audit.ok).toBe(true);
  });
});

describe("describeDeckToken", () => {
  it.each([
    ["#SteamDeckVerified_TestResult_InterfaceTextIsNotLegible", "Interface text is not legible"],
    ["#SteamDeckVerified_TestResult_ControllerGlyphsMatchDeckDevice", "Controller glyphs match Deck device"],
    ["#SteamOS_TestResult_GameStartupFunctional", "Game startup functional"],
    ["#SteamDeckVerified_TestResult_UnsupportedAntiCheat_Other", "Unsupported anti cheat other"],
  ])("%s", (token, text) => {
    expect(describeDeckToken(token)).toBe(text);
  });
});
