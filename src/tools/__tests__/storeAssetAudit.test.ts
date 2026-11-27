import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { encodePng } from "../../storeAssets/png.js";
import { registeredTools, schemaOf } from "./harness.js";
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
    ["header_capsule.png", "headerCapsule"],
    ["ss_01.png", "screenshot"],
    ["ss01.png", "screenshot"],
    // Screenshots named after the scene must not match the slot word (#77).
    ["screenshot_main_menu.png", "screenshot"],
    ["screenshot_hero_fight.png", "screenshot"],
    ["ss_logo_reveal.png", "screenshot"],
    ["screenshot-small-town.png", "screenshot"],
    ["screenshot_background_city.png", "screenshot"],
    ["Screenshot Vertical Slice.jpg", "screenshot"],
    // Event headers must not fall through to the generic header hint (#96).
    ["event_header.png", "eventHeader"],
    ["eventheader.jpg", "eventHeader"],
    ["Event-Header.png", "eventHeader"],
    ["library_header.png", "libraryHeader"],
    ["event_cover_main.png", "eventCover"],
    ["community_icon_small.png", "communityIcon"],
  ])("%s -> %s by name", (name, slot) => {
    expect(inferSlot(png(dir, name, 10, 10), name)).toEqual({ slot, by: "name" });
  });

  it("does not treat a word that merely starts with ss as a screenshot hint", () => {
    expect(inferSlot(png(dir, "ssao_header.png", 10, 10), "ssao_header.png")).toEqual({
      slot: "headerCapsule",
      by: "name",
    });
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

describe("auditStoreAssetDir with surrounding whitespace (#109)", () => {
  it.each([" ", "\n", "\r\n"])("gives the same result when the path ends in %j", (suffix) => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "header.png", 920, 430);
    png(dir, "small.png", 462, 174);
    png(dir, "main.png", 1000, 700); // wrong size

    const clean = auditStoreAssetDir(dir);
    const padded = auditStoreAssetDir(dir + suffix);
    // `directory` echoes the input as given; everything else must match.
    expect({ ...padded, directory: dir }).toEqual(clean);
    expect(padded.checked).toBe(3);
    expect(padded.files.find((f) => f.file === "header.png")?.ok).toBe(true);
    expect(padded.files.find((f) => f.file === "main.png")?.errors[0].code).toBe("SIZE");
  });
});

describe("auditStoreAssetDir explicit slots (#104)", () => {
  it("validates an explicitly assigned file as that slot, size error included", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "key_art_final.png", 3000, 1000);
    png(dir, "header.png", 920, 430);

    const audit = auditStoreAssetDir(dir, { "key_art_final.png": "libraryHero" });
    const hero = audit.files.find((f) => f.file === "key_art_final.png");
    expect(hero?.slot).toBe("libraryHero");
    expect(hero?.inferred_by).toBe("explicit");
    expect(hero?.errors[0].code).toBe("SIZE");
    expect(audit.unrecognized).toEqual([]);
    expect(audit).not.toHaveProperty("warnings");
  });

  it("lets an explicit entry override a name hint", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "header_alt.png", 920, 430);
    const audit = auditStoreAssetDir(dir, { "header_alt.png": "libraryHeader" });
    expect(audit.files[0]).toMatchObject({ slot: "libraryHeader", inferred_by: "explicit", ok: true });
  });

  it("warns about names that are not in the folder without failing", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "header.png", 920, 430);
    const audit = auditStoreAssetDir(dir, { "missing.png": "libraryHero" });
    expect(audit.warnings).toEqual([expect.stringContaining("missing.png")]);
    expect(audit.files.find((f) => f.file === "header.png")?.ok).toBe(true);
  });

  it("is unchanged without slots", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "key_art_final.png", 3000, 1000);
    const audit = auditStoreAssetDir(dir);
    expect(audit.unrecognized).toEqual(["key_art_final.png"]);
    expect(audit).not.toHaveProperty("warnings");
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

describe("steam_validateStoreAssetDir slots input (#104)", () => {
  const tool = registeredTools().get("steam_validateStoreAssetDir")!;

  it("passes slots through to the audit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-audit-"));
    png(dir, "key_art_final.png", 3000, 1000);
    const body = JSON.parse((await tool.handler({ dir, slots: { "key_art_final.png": "libraryHero" } })).content[0].text);
    expect(body.files[0]).toMatchObject({ file: "key_art_final.png", slot: "libraryHero", inferred_by: "explicit" });
  });

  it("rejects an unknown slot name in the schema", () => {
    const schema = schemaOf(tool);
    expect(schema.safeParse({ dir: "x", slots: { "a.png": "libraryHero" } }).success).toBe(true);
    expect(schema.safeParse({ dir: "x", slots: { "a.png": "hero" } }).success).toBe(false);
  });
});
