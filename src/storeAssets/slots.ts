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
] as const;

export type StoreAssetSlot = (typeof STORE_ASSET_SLOTS)[number];

export type SlotSpec = {
  width?: number;
  height?: number;
  /** Screenshot: min size + 16:9. Logo: width===1280 OR height===720. */
  kind: "exact" | "screenshot" | "logo";
  formats: Array<"png" | "jpeg">;
  requireAlpha?: boolean;
};

export const SLOT_SPECS: Record<StoreAssetSlot, SlotSpec> = {
  headerCapsule: { kind: "exact", width: 920, height: 430, formats: ["png", "jpeg"] },
  smallCapsule: { kind: "exact", width: 462, height: 174, formats: ["png", "jpeg"] },
  mainCapsule: { kind: "exact", width: 1232, height: 706, formats: ["png", "jpeg"] },
  verticalCapsule: { kind: "exact", width: 748, height: 896, formats: ["png", "jpeg"] },
  libraryCapsule: { kind: "exact", width: 600, height: 900, formats: ["png", "jpeg"] },
  libraryHero: { kind: "exact", width: 3840, height: 1240, formats: ["png"] },
  libraryLogo: { kind: "logo", formats: ["png"], requireAlpha: true },
  libraryHeader: { kind: "exact", width: 920, height: 430, formats: ["png", "jpeg"] },
  screenshot: { kind: "screenshot", formats: ["png", "jpeg"] },
  pageBackground: { kind: "exact", width: 1438, height: 810, formats: ["png", "jpeg"] },
};

/** Unofficial Partner admin FormData field names. Subject to Valve HTML changes. */
export const SLOT_FORM_FIELD: Record<StoreAssetSlot, string> = {
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
};
