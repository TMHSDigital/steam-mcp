import specs from "./store-specs.json" with { type: "json" };

export const STORE_ASSET_SLOTS = [
  "headerCapsule",
  "smallCapsule",
  "mainCapsule",
  "verticalCapsule",
  "libraryCapsule",
  "libraryHero",
  "libraryLogo",
  "libraryHeader",
  "screenshot",
  "pageBackground",
  "achievementIcon",
  "communityIcon",
  "eventCover",
  "eventHeader",
] as const;

export type StoreAssetSlot = (typeof STORE_ASSET_SLOTS)[number];

export type SlotSpec = {
  /**
   * exact: width x height. logo: width wide and/or height tall.
   * screenshot: at least width x height at the screenshots aspect.
   */
  kind: "exact" | "screenshot" | "logo";
  width: number;
  height: number;
  formats: Array<"png" | "jpeg">;
  requireAlpha?: boolean;
  required: boolean;
  rules?: string;
};

type SpecFile = {
  verified: string;
  sources: string[];
  slots: Array<SlotSpec & { slot: string }>;
  screenshots: {
    minWidth: number;
    minHeight: number;
    aspect: [number, number];
    aspectTolerance: number;
    minCount: number;
    recommendedCount: number;
  };
};

// Every size lives in store-specs.json (the shared Game-Systems store-specs
// contract). Nothing else in the code base may hard-code a slot size.
const specFile = specs as unknown as SpecFile;

function loadSlots(): Record<StoreAssetSlot, SlotSpec> {
  const names = specFile.slots.map((s) => s.slot);
  const expected: readonly string[] = STORE_ASSET_SLOTS;
  if (names.length !== expected.length || !expected.every((n) => names.includes(n))) {
    throw new Error(`store-specs.json slots (${names.join(", ")}) do not match STORE_ASSET_SLOTS.`);
  }
  return Object.fromEntries(specFile.slots.map(({ slot, ...spec }) => [slot, spec])) as Record<
    StoreAssetSlot,
    SlotSpec
  >;
}

export const SLOT_SPECS = loadSlots();
export const SCREENSHOT_RULES = specFile.screenshots;
export const SPECS_VERIFIED = specFile.verified;
export const SPECS_SOURCES = specFile.sources;
export const REQUIRED_SLOTS = STORE_ASSET_SLOTS.filter((s) => SLOT_SPECS[s].required);

/**
 * Unofficial Partner admin FormData field names. Subject to Valve HTML changes.
 * Slots without an entry (achievement, community, and event art) are uploaded
 * elsewhere in Steamworks, so steam_uploadStoreImage cannot send them.
 */
export const SLOT_FORM_FIELD = {
  headerCapsule: "header_image",
  smallCapsule: "small_capsule",
  mainCapsule: "main_capsule",
  verticalCapsule: "hero_capsule",
  libraryCapsule: "library_capsule",
  libraryHero: "library_hero",
  libraryLogo: "library_logo",
  libraryHeader: "library_header",
  screenshot: "screenshot",
  pageBackground: "page_background",
} as const satisfies Partial<Record<StoreAssetSlot, string>>;

export type UploadableSlot = keyof typeof SLOT_FORM_FIELD;

export const UPLOADABLE_SLOTS = Object.keys(SLOT_FORM_FIELD) as [UploadableSlot, ...UploadableSlot[]];
