import { readdirSync } from "node:fs";
import { join } from "node:path";
import { FileTooLargeError, LocalPathError, MAX_FILE_BYTES, readLocalFile, requireKind } from "./safePath.js";
import { SCREENSHOT_RULES, SLOT_SPECS, type StoreAssetSlot } from "./slots.js";
import { parseImage, UnsupportedPixelFormatError } from "./png.js";
import { analyzeHero } from "./heroHeuristics.js";

export { MAX_FILE_BYTES };

export type ValidationIssue = {
  code: string;
  message: string;
};

export type StoreAssetValidation = {
  ok: boolean;
  slot: StoreAssetSlot;
  path: string;
  width?: number;
  height?: number;
  format?: "png" | "jpeg";
  hasAlpha?: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export function validateStoreAsset(path: string, slot: StoreAssetSlot): StoreAssetValidation {
  const spec = SLOT_SPECS[slot];
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const result: StoreAssetValidation = {
    ok: false,
    slot,
    path,
    errors,
    warnings,
  };

  let buf: Buffer;
  try {
    buf = readLocalFile(path, MAX_FILE_BYTES);
  } catch (error) {
    if (error instanceof FileTooLargeError) {
      errors.push({
        code: "FILE_SIZE",
        message: `File is ${error.bytes} bytes; store images over ${MAX_FILE_BYTES} bytes are rejected without reading.`,
      });
      return result;
    }
    errors.push({
      code: "IO",
      message: `Cannot read file: ${error instanceof LocalPathError ? error.message : "unexpected error"}`,
    });
    return result;
  }

  // Read the header first. Pixels are decoded only for a libraryHero whose
  // declared size is already correct, so a bogus IHDR never drives allocation.
  let image;
  try {
    image = parseImage(buf, false);
    const decodePixels =
      slot === "libraryHero" &&
      image.format === "png" &&
      image.width === spec.width &&
      image.height === spec.height;
    if (decodePixels) {
      try {
        image = parseImage(buf, true);
      } catch (error) {
        // Palette, grayscale, 16-bit, and interlaced PNGs are valid uploads.
        // Only the optional hero heuristics need pixels, so skip them.
        if (!(error instanceof UnsupportedPixelFormatError)) {
          throw error;
        }
        warnings.push({
          code: "HERO_HEURISTICS_SKIPPED",
          message: `Hero heuristics skipped: ${error.message} Size and format were still checked.`,
        });
      }
    }
  } catch (error) {
    errors.push({
      code: "PARSE",
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  result.width = image.width;
  result.height = image.height;
  result.format = image.format;
  result.hasAlpha = image.hasAlpha;

  if (!spec.formats.includes(image.format)) {
    errors.push({
      code: "FORMAT",
      message: `${slot} must be ${spec.formats.join(" or ").toUpperCase()} (got ${image.format}).`,
    });
  }

  if (spec.requireAlpha && !image.hasAlpha) {
    errors.push({
      code: "ALPHA",
      message: `${slot} must be a PNG with an alpha channel.`,
    });
  }

  if (spec.kind === "exact") {
    if (image.width !== spec.width || image.height !== spec.height) {
      errors.push({
        code: "SIZE",
        message: `${slot} must be ${spec.width}x${spec.height} (got ${image.width}x${image.height}).`,
      });
    }
    if (image.width * 2 === spec.width && image.height * 2 === spec.height) {
      errors.push({
        code: "SIZE_HALF",
        message:
          slot === "libraryHero"
            ? `libraryHero ${image.width}x${image.height} is Valve's auto-generated half-size. Upload the ${spec.width}x${spec.height} PNG.`
            : `${slot} ${image.width}x${image.height} is exactly half the required ${spec.width}x${spec.height}. Export at full size.`,
      });
    }
  }

  if (spec.kind === "logo") {
    if (image.width !== spec.width && image.height !== spec.height) {
      errors.push({
        code: "SIZE",
        message: `${slot} must be ${spec.width}px wide and/or ${spec.height}px tall (got ${image.width}x${image.height}).`,
      });
    }
  }

  if (spec.kind === "screenshot") {
    const { minWidth, minHeight, aspect, aspectTolerance } = SCREENSHOT_RULES;
    if (image.width < minWidth || image.height < minHeight) {
      errors.push({
        code: "SIZE",
        message: `screenshot must be at least ${minWidth}x${minHeight} (got ${image.width}x${image.height}).`,
      });
    }
    const ratio = image.width / image.height;
    if (Math.abs(ratio - aspect[0] / aspect[1]) > aspectTolerance) {
      errors.push({
        code: "ASPECT",
        message: `screenshot must be ${aspect[0]}:${aspect[1]} (got ${image.width}x${image.height}, ratio ${ratio.toFixed(3)}).`,
      });
    }
  }

  if (slot === "libraryHero" && image.rgba && image.width && image.height) {
    const flags = analyzeHero(image.rgba, image.width, image.height);
    if (flags.ribbon) {
      errors.push({
        code: "HERO_RIBBON",
        message:
          "Heuristic: high-chroma banner in the top or bottom 12% (PROTOTYPE / compositor ribbon).",
      });
    }
    if (flags.seam) {
      errors.push({
        code: "HERO_SEAM",
        message: "Heuristic: vertical midline looks like a two-panel seam.",
      });
    }
    if (flags.wordmarkFail) {
      errors.push({
        code: "HERO_WORDMARK",
        message:
          "Heuristic: sharp high-contrast blobs on the hero (wordmark belongs on libraryLogo, not libraryHero).",
      });
    } else if (flags.wordmarkWarn) {
      warnings.push({
        code: "HERO_WORDMARK",
        message:
          "Heuristic: possible wordmark or UI on the library hero. Valve requires artwork only, no text.",
      });
    }
  }

  result.ok = errors.length === 0;
  return result;
}


export type AchievementIconSetValidation = {
  ok: boolean;
  directory: string;
  checked: number;
  /** Base names with only one of the _achieved / _unachieved pair. */
  missing_pairs: Array<{ name: string; missing: "achieved" | "unachieved" }>;
  /** Image files whose name does not end in _achieved or _unachieved. */
  unpaired_names: string[];
  files: StoreAssetValidation[];
};

const ICON_EXT = /\.(jpe?g|png)$/i;
const PAIR_SUFFIX = /^(.*)_(achieved|unachieved)$/i;

/**
 * Validate every image in a directory as an achievement icon (256x256 JPEG)
 * and check that each `<name>_achieved` has a matching `<name>_unachieved`.
 */
export function validateAchievementIconDir(directory: string): AchievementIconSetValidation {
  const root = requireKind(directory, "directory").path; // trimmed and resolved (#109)
  const names = readdirSync(root).filter((n) => ICON_EXT.test(n)).sort();
  const files = names.map((n) => validateStoreAsset(join(root, n), "achievementIcon"));

  const pairs = new Map<string, Set<string>>();
  const unpaired: string[] = [];
  for (const n of names) {
    const m = n.replace(ICON_EXT, "").match(PAIR_SUFFIX);
    if (!m) {
      unpaired.push(n);
      continue;
    }
    const set = pairs.get(m[1]) ?? new Set<string>();
    set.add(m[2].toLowerCase());
    pairs.set(m[1], set);
  }
  const missing: AchievementIconSetValidation["missing_pairs"] = [];
  for (const [name, set] of pairs) {
    if (!set.has("achieved")) missing.push({ name, missing: "achieved" });
    if (!set.has("unachieved")) missing.push({ name, missing: "unachieved" });
  }

  return {
    ok: names.length > 0 && missing.length === 0 && files.every((f) => f.ok),
    directory,
    checked: names.length,
    missing_pairs: missing,
    unpaired_names: unpaired,
    files,
  };
}