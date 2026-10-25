import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SLOT_SPECS, type StoreAssetSlot } from "./slots.js";
import { parseImage } from "./png.js";
import { validateStoreAsset, MAX_FILE_BYTES, type StoreAssetValidation } from "./validate.js";

// Store-page launch readiness: validate every image in a folder and report
// which required store and library slots are still missing.

export const REQUIRED_SLOTS: StoreAssetSlot[] = [
  "headerCapsule",
  "smallCapsule",
  "mainCapsule",
  "verticalCapsule",
  "libraryCapsule",
  "libraryHero",
  "libraryLogo",
];

export const MIN_SCREENSHOTS = 5;

/** Filename hints, most specific first. Matched against the lowercased name without separators. */
const NAME_HINTS: Array<[RegExp, StoreAssetSlot]> = [
  // The vertical capsule was once called the "hero capsule".
  [/herocapsule/, "verticalCapsule"],
  [/libraryhero|hero/, "libraryHero"],
  [/librarylogo|logo/, "libraryLogo"],
  [/libraryheader/, "libraryHeader"],
  [/librarycapsule|library600|600x900/, "libraryCapsule"],
  [/verticalcapsule|vertical/, "verticalCapsule"],
  [/maincapsule|main/, "mainCapsule"],
  [/smallcapsule|small/, "smallCapsule"],
  [/headercapsule|header/, "headerCapsule"],
  [/pagebackground|background/, "pageBackground"],
  [/eventcover/, "eventCover"],
  [/eventheader/, "eventHeader"],
  [/communityicon/, "communityIcon"],
  [/achieved|unachieved|achievement/, "achievementIcon"],
  [/screenshot|^ss\d|^ss/, "screenshot"],
];

const IMAGE = /\.(png|jpe?g)$/i;

function slotBySize(width: number, height: number): StoreAssetSlot | undefined {
  const exact = (Object.entries(SLOT_SPECS) as Array<[StoreAssetSlot, (typeof SLOT_SPECS)[StoreAssetSlot]]>).filter(
    ([, s]) => s.kind === "exact" && s.width === width && s.height === height,
  );
  // headerCapsule and libraryHeader share 920x430; prefer the store header.
  if (exact.length) return exact[0][0];
  if (width >= 1920 && Math.abs(width / height - 16 / 9) < 0.02) return "screenshot";
  if (width === 1280 || height === 720) return "libraryLogo";
  return undefined;
}

export function inferSlot(path: string, name: string): { slot?: StoreAssetSlot; by: "name" | "size" | "none" } {
  const key = name.toLowerCase().replace(IMAGE, "").replace(/[\s_.-]+/g, "");
  for (const [pattern, slot] of NAME_HINTS) {
    if (pattern.test(key)) return { slot, by: "name" };
  }
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return { by: "none" };
    const { width, height } = parseImage(readFileSync(path), false);
    const slot = slotBySize(width, height);
    return slot ? { slot, by: "size" } : { by: "none" };
  } catch {
    return { by: "none" };
  }
}

export interface StoreAssetDirAudit {
  ok: boolean;
  directory: string;
  checked: number;
  missing_slots: StoreAssetSlot[];
  screenshots: { found: number; required: number };
  unrecognized: string[];
  files: Array<StoreAssetValidation & { file: string; inferred_by: "name" | "size" }>;
}

export function auditStoreAssetDir(directory: string): StoreAssetDirAudit {
  const names = readdirSync(directory).filter((n) => IMAGE.test(n)).sort();
  const files: StoreAssetDirAudit["files"] = [];
  const unrecognized: string[] = [];

  for (const name of names) {
    const path = join(directory, name);
    const { slot, by } = inferSlot(path, name);
    if (!slot || by === "none") {
      unrecognized.push(name);
      continue;
    }
    files.push({ ...validateStoreAsset(path, slot), file: name, inferred_by: by });
  }

  const validSlots = new Set(files.filter((f) => f.ok).map((f) => f.slot));
  const missing = REQUIRED_SLOTS.filter((s) => !validSlots.has(s));
  const screenshots = files.filter((f) => f.slot === "screenshot" && f.ok).length;

  return {
    ok: missing.length === 0 && screenshots >= MIN_SCREENSHOTS && files.every((f) => f.ok),
    directory,
    checked: names.length,
    missing_slots: missing,
    screenshots: { found: screenshots, required: MIN_SCREENSHOTS },
    unrecognized,
    files,
  };
}
