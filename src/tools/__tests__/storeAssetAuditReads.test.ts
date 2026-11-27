import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, afterAll } from "vitest";
import { encodePng } from "../../storeAssets/png.js";

// Count reads through the one local-file helper (#133).
const reads = vi.hoisted(() => [] as string[]);
vi.mock("../../storeAssets/safePath.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../storeAssets/safePath.js")>();
  return {
    ...actual,
    readLocalFile: (path: string, max: number) => {
      reads.push(path);
      return actual.readLocalFile(path, max);
    },
  };
});

const { auditStoreAssetDir } = await import("../../storeAssets/audit.js");

const dir = mkdtempSync(join(tmpdir(), "steam-audit-reads-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function png(name: string, w: number, h: number) {
  writeFileSync(join(dir, name), encodePng(w, h, new Uint8Array(w * h * 4).fill(40), false));
}

describe("auditStoreAssetDir reads", () => {
  it("reads each file at most once, including files inferred from size", () => {
    png("header.png", 920, 430); // name hint
    png("a.png", 462, 174); // size: small capsule
    png("b.png", 3840, 1240); // size: library hero (decoded for heuristics)
    png("c.png", 10, 10); // size matches nothing

    const audit = auditStoreAssetDir(dir);
    expect(audit.files.map((f) => [f.file, f.slot, f.inferred_by])).toEqual([
      ["a.png", "smallCapsule", "size"],
      ["b.png", "libraryHero", "size"],
      ["header.png", "headerCapsule", "name"],
    ]);
    expect(audit.unrecognized).toEqual(["c.png"]);

    const counts = new Map<string, number>();
    for (const p of reads) counts.set(p, (counts.get(p) ?? 0) + 1);
    expect(counts.size).toBe(4);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
  }, 30_000);
});
