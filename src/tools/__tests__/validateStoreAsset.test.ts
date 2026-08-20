import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { encodePng } from "../../storeAssets/png.js";
import { validateStoreAsset } from "../../storeAssets/validate.js";
import type { StoreAssetSlot } from "../../storeAssets/slots.js";

const dirs: string[] = [];

function tmpPng(
  name: string,
  width: number,
  height: number,
  fill: (rgba: Uint8Array, w: number, h: number) => void,
  withAlpha = false,
): string {
  const dir = mkdtempSync(join(tmpdir(), "steam-asset-"));
  dirs.push(dir);
  const rgba = new Uint8Array(width * height * 4);
  fill(rgba, width, height);
  const buf = encodePng(width, height, rgba, withAlpha);
  const path = join(dir, name);
  writeFileSync(path, buf);
  return path;
}

function solid(
  r: number,
  g: number,
  b: number,
  a = 255,
): (rgba: Uint8Array) => void {
  return (rgba) => {
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  };
}

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("validateStoreAsset sizes", () => {
  it("accepts headerCapsule 920x430", () => {
    const path = tmpPng("h.png", 920, 430, solid(20, 20, 30));
    const v = validateStoreAsset(path, "headerCapsule");
    expect(v.ok).toBe(true);
    expect(v.width).toBe(920);
    expect(v.height).toBe(430);
  });

  it("rejects wrong headerCapsule size", () => {
    const path = tmpPng("h.png", 460, 215, solid(20, 20, 30));
    const v = validateStoreAsset(path, "headerCapsule");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "SIZE")).toBe(true);
  });

  it("accepts libraryLogo 1280 wide", () => {
    const path = tmpPng("logo.png", 1280, 400, solid(255, 255, 255, 0), true);
    const v = validateStoreAsset(path, "libraryLogo");
    expect(v.ok).toBe(true);
  });

  it("accepts libraryLogo 720 tall", () => {
    const path = tmpPng("logo.png", 800, 720, solid(255, 255, 255, 0), true);
    const v = validateStoreAsset(path, "libraryLogo");
    expect(v.ok).toBe(true);
  });

  it("rejects libraryLogo without matching dimension", () => {
    const path = tmpPng("logo.png", 1000, 1000, solid(255, 255, 255, 0), true);
    const v = validateStoreAsset(path, "libraryLogo");
    expect(v.ok).toBe(false);
  });

  it("rejects libraryLogo RGB without alpha", () => {
    const path = tmpPng("logo.png", 1280, 720, solid(255, 255, 255), false);
    const v = validateStoreAsset(path, "libraryLogo");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "ALPHA")).toBe(true);
  });

  it("accepts screenshot 1920x1080", () => {
    const path = tmpPng("ss.png", 1920, 1080, solid(10, 10, 10));
    const v = validateStoreAsset(path, "screenshot");
    expect(v.ok).toBe(true);
  });

  it("rejects screenshot below 1920x1080", () => {
    const path = tmpPng("ss.png", 1280, 720, solid(10, 10, 10));
    const v = validateStoreAsset(path, "screenshot");
    expect(v.ok).toBe(false);
  });

  it("rejects non-16:9 screenshot", () => {
    const path = tmpPng("ss.png", 1920, 1200, solid(10, 10, 10));
    const v = validateStoreAsset(path, "screenshot");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "ASPECT")).toBe(true);
  });

  it("rejects libraryHero half-size 1920x620", () => {
    const path = tmpPng("hero.png", 1920, 620, solid(20, 20, 30));
    const v = validateStoreAsset(path, "libraryHero");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "SIZE_HALF" || e.code === "SIZE")).toBe(
      true,
    );
  });

  it("reports IO error for missing file", () => {
    const v = validateStoreAsset("Z:/definitely-missing-steam-asset.png", "smallCapsule");
    expect(v.ok).toBe(false);
    expect(v.errors[0]?.code).toBe("IO");
  });
});

describe("validateStoreAsset libraryHero heuristics", () => {
  const W = 3840;
  const H = 1240;

  it("accepts a clean dark hero", () => {
    const path = tmpPng("hero.png", W, H, solid(28, 30, 38));
    const v = validateStoreAsset(path, "libraryHero");
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  }, 30_000);

  it("rejects a PROTOTYPE ribbon band", () => {
    const path = tmpPng("hero.png", W, H, (rgba) => {
      const band = Math.floor(H * 0.12);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (y < band) {
            rgba[i] = 255;
            rgba[i + 1] = 201;
            rgba[i + 2] = 63;
          } else {
            rgba[i] = 28;
            rgba[i + 1] = 30;
            rgba[i + 2] = 38;
          }
          rgba[i + 3] = 255;
        }
      }
    });
    const v = validateStoreAsset(path, "libraryHero");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "HERO_RIBBON")).toBe(true);
  }, 30_000);

  it("rejects a two-panel vertical seam", () => {
    const path = tmpPng("hero.png", W, H, (rgba) => {
      const mid = Math.floor(W / 2);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (x < mid) {
            rgba[i] = 180;
            rgba[i + 1] = 40;
            rgba[i + 2] = 40;
          } else {
            rgba[i] = 40;
            rgba[i + 1] = 40;
            rgba[i + 2] = 180;
          }
          rgba[i + 3] = 255;
        }
      }
    });
    const v = validateStoreAsset(path, "libraryHero");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "HERO_SEAM")).toBe(true);
  }, 30_000);

  it("rejects a high-contrast wordmark-like grid", () => {
    const path = tmpPng("hero.png", W, H, (rgba) => {
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 20;
        rgba[i + 1] = 20;
        rgba[i + 2] = 24;
        rgba[i + 3] = 255;
      }
      for (let y = 200; y < 1000; y++) {
        for (let x = 80; x < 3600; x++) {
          if (x % 12 < 4 || y % 28 < 6) {
            const i = (y * W + x) * 4;
            rgba[i] = 250;
            rgba[i + 1] = 250;
            rgba[i + 2] = 240;
          }
        }
      }
    });
    const v = validateStoreAsset(path, "libraryHero");
    expect(
      v.errors.some((e) => e.code === "HERO_WORDMARK") ||
        v.warnings.some((e) => e.code === "HERO_WORDMARK"),
    ).toBe(true);
  }, 30_000);
});

describe("slot coverage", () => {
  const exact: Array<[StoreAssetSlot, number, number]> = [
    ["smallCapsule", 462, 174],
    ["mainCapsule", 1232, 706],
    ["verticalCapsule", 748, 896],
    ["libraryCapsule", 600, 900],
    ["libraryHeader", 920, 430],
    ["pageBackground", 1438, 810],
  ];

  it.each(exact)("%s accepts %dx%d", (slot, w, h) => {
    const path = tmpPng(`${slot}.png`, w, h, solid(12, 12, 16));
    expect(validateStoreAsset(path, slot).ok).toBe(true);
  });
});
