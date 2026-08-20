import { describe, it, expect } from "vitest";
import { refuseIfUnconfirmed } from "../../partner/tools.js";
import { SLOT_FORM_FIELD } from "../../storeAssets/slots.js";

describe("partner destructive gates", () => {
  it("allows dry_run without confirm", () => {
    expect(refuseIfUnconfirmed(true, undefined)).toBeNull();
    expect(refuseIfUnconfirmed(true, false)).toBeNull();
  });

  it("rejects live calls without confirm", () => {
    expect(refuseIfUnconfirmed(false, undefined)).toMatch(/confirm must be true/);
    expect(refuseIfUnconfirmed(false, false)).toMatch(/confirm must be true/);
  });

  it("allows live calls with confirm", () => {
    expect(refuseIfUnconfirmed(false, true)).toBeNull();
  });
});

describe("partner form fields", () => {
  it("maps libraryHero to library_hero|image", () => {
    expect(`${SLOT_FORM_FIELD.libraryHero}|image`).toBe("library_hero|image");
  });
});
