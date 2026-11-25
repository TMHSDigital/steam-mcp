import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readLocalFile, requireKind } from "./safePath.js";
import { REQUIRED_SLOTS, SCREENSHOT_RULES, SLOT_SPECS, type StoreAssetSlot } from "./slots.js";
import { parseImage } from "./png.js";
import { validateStoreAsset, MAX_FILE_BYTES, type StoreAssetValidation } from "./validate.js";

// Store-page launch readiness: validate every image in a folder and report
// which required store and library slots are still missing.

export { REQUIRED_SLOTS };
export const MIN_SCREENSHOTS = SCREENSHOT_RULES.minCount;

/** Filename hints, most specific first. Matched against the lowercased name without separators. */
const NAME_HINTS: Array<[RegExp, StoreAssetSlot]> = [
  // The vertical capsule was once called the "hero capsule".
  [/herocapsule/, "verticalCapsule"],
  // Event, community, and achievement art before the generic words below:
  // "event_header" would otherwise match /header/ (#96).
  [/eventcover/, "eventCover"],
  [/eventheader/, "eventHeader"],
  [/communityicon/, "communityIcon"],
  [/achieved|unachieved|achievement/, "achievementIcon"],
  [/libraryhero|hero/, "libraryHero"],
  [/librarylogo|logo/, "libraryLogo"],
  [/libraryheader/, "libraryHeader"],
  [/librarycapsule|library600|600x900/, "libraryCapsule"],
  [/verticalcapsule|vertical/, "verticalCapsule"],
  [/maincapsule|main/, "mainCapsule"],
  [/smallcapsule|small/, "smallCapsule"],
  [/headercapsule|header/, "headerCapsule"],
  [/pagebackground|background/, "pageBackground"],
];

/**
 * Screenshots are checked before NAME_HINTS: they are often named after the
 * scene ("screenshot_main_menu", "ss_hero_fight"), and those words would
 * otherwise match another slot. Tested on the lowercased name without the
 * extension, so "ss" must be followed by a digit or separator ("ssao.png" is
 * not a screenshot hint).
 */
const SCREENSHOT_HINT = /screenshot|^ss(?:\d|[\s_.-]|$)/;

const IMAGE = /\.(png|jpe?g)$/i;

function slotBySize(width: number, height: number): StoreAssetSlot | undefined {
  const exact = (Object.entries(SLOT_SPECS) as Array<[StoreAssetSlot, (typeof SLOT_SPECS)[StoreAssetSlot]]>).filter(
    ([, s]) => s.kind === "exact" && s.width === width && s.height === height,
  );
  // headerCapsule and libraryHeader share 920x430; prefer the store header.
  if (exact.length) return exact[0][0];
  const { minWidth, aspect, aspectTolerance } = SCREENSHOT_RULES;
  if (width >= minWidth && Math.abs(width / height - aspect[0] / aspect[1]) < aspectTolerance) return "screenshot";
  const logo = SLOT_SPECS.libraryLogo;
  if (width === logo.width || height === logo.height) return "libraryLogo";
  return undefined;
}

export function inferSlot(path: string, name: string): { slot?: StoreAssetSlot; by: "name" | "size" | "none" } {
  const base = name.toLowerCase().replace(IMAGE, "");
  if (SCREENSHOT_HINT.test(base)) return { slot: "screenshot", by: "name" };
  const key = base.replace(/[\s_.-]+/g, "");
  for (const [pattern, slot] of NAME_HINTS) {
    if (pattern.test(key)) return { slot, by: "name" };
  }
  try {
    const { width, height } = parseImage(readLocalFile(path, MAX_FILE_BYTES), false);
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
  files: Array<StoreAssetValidation & { file: string; inferred_by: "name" | "size" | "explicit" }>;
  warnings?: string[];
}

/**
 * Audit every image in `directory`. `slots` maps file names to the slot they
 * are for; an entry there wins over inference (#104).
 */
export function auditStoreAssetDir(
  directory: string,
  slots: Partial<Record<string, StoreAssetSlot>> = {},
): StoreAssetDirAudit {
  const names = readdirSync(requireKind(directory, "directory").path).filter((n) => IMAGE.test(n)).sort();
  const files: StoreAssetDirAudit["files"] = [];
  const unrecognized: string[] = [];
  const present = new Set(names);
  const unknown = Object.keys(slots).filter((n) => !present.has(n));

  for (const name of names) {
    const path = join(directory, name);
    const explicit = Object.hasOwn(slots, name) ? slots[name] : undefined;
    const { slot, by } = explicit ? { slot: explicit, by: "explicit" as const } : inferSlot(path, name);
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
    ...(unknown.length
      ? { warnings: unknown.map((n) => `slots names "${n}", which is not a PNG or JPEG in this folder.`) }
      : {}),
  };
}
