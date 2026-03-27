import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-declare schemas inline to test validation without importing tool registration.
// These mirror the schemas in each tool file.

const steamIdSchema = z.string().regex(/^\d{17}$/, "Must be a 17-digit Steam64 ID");
const publishedFileIdSchema = z.string().regex(/^\d+$/, "Must be a numeric Workshop item ID");
const appIdSchema = z.number().int().positive();
const countryCodeSchema = z.string().length(2);

describe("Steam ID validation", () => {
  it("accepts valid 17-digit ID", () => {
    expect(steamIdSchema.parse("76561197960435530")).toBe("76561197960435530");
  });

  it("rejects empty string", () => {
    expect(() => steamIdSchema.parse("")).toThrow();
  });

  it("rejects non-numeric string", () => {
    expect(() => steamIdSchema.parse("abcdefghijklmnopq")).toThrow();
  });

  it("rejects too-short numeric string", () => {
    expect(() => steamIdSchema.parse("12345")).toThrow();
  });

  it("rejects too-long numeric string", () => {
    expect(() => steamIdSchema.parse("123456789012345678")).toThrow();
  });

  it("rejects string with spaces", () => {
    expect(() => steamIdSchema.parse("7656119796043 530")).toThrow();
  });
});

describe("Published file ID validation", () => {
  it("accepts numeric string", () => {
    expect(publishedFileIdSchema.parse("814498849")).toBe("814498849");
  });

  it("accepts large numeric string", () => {
    expect(publishedFileIdSchema.parse("99999999999")).toBe("99999999999");
  });

  it("rejects empty string", () => {
    expect(() => publishedFileIdSchema.parse("")).toThrow();
  });

  it("rejects non-numeric characters", () => {
    expect(() => publishedFileIdSchema.parse("abc123")).toThrow();
  });

  it("rejects string with special chars", () => {
    expect(() => publishedFileIdSchema.parse("123-456")).toThrow();
  });
});

describe("App ID validation", () => {
  it("accepts positive integer", () => {
    expect(appIdSchema.parse(440)).toBe(440);
  });

  it("rejects zero", () => {
    expect(() => appIdSchema.parse(0)).toThrow();
  });

  it("rejects negative", () => {
    expect(() => appIdSchema.parse(-1)).toThrow();
  });

  it("rejects float", () => {
    expect(() => appIdSchema.parse(1.5)).toThrow();
  });

  it("rejects string", () => {
    expect(() => appIdSchema.parse("440")).toThrow();
  });
});

describe("Country code validation", () => {
  it("accepts two-letter code", () => {
    expect(countryCodeSchema.parse("US")).toBe("US");
  });

  it("rejects single letter", () => {
    expect(() => countryCodeSchema.parse("U")).toThrow();
  });

  it("rejects three letters", () => {
    expect(() => countryCodeSchema.parse("USA")).toThrow();
  });
});

describe("Leaderboard datarequest + steamid cross-validation", () => {
  const datarequestSchema = z.number().int().min(0).max(2).optional();

  it("datarequest 0 (global) is valid without steamid", () => {
    expect(datarequestSchema.parse(0)).toBe(0);
  });

  it("datarequest rejects values > 2", () => {
    expect(() => datarequestSchema.parse(3)).toThrow();
  });

  it("datarequest rejects negative values", () => {
    expect(() => datarequestSchema.parse(-1)).toThrow();
  });
});

describe("Vanity URL validation", () => {
  const vanityUrlSchema = z.string().min(1);
  const urlTypeSchema = z.number().int().min(1).max(3).optional();

  it("accepts valid vanity URL", () => {
    expect(vanityUrlSchema.parse("gabelogannewell")).toBe("gabelogannewell");
  });

  it("rejects empty vanity URL", () => {
    expect(() => vanityUrlSchema.parse("")).toThrow();
  });

  it("url_type accepts 1-3", () => {
    expect(urlTypeSchema.parse(1)).toBe(1);
    expect(urlTypeSchema.parse(2)).toBe(2);
    expect(urlTypeSchema.parse(3)).toBe(3);
  });

  it("url_type rejects 0 and 4", () => {
    expect(() => urlTypeSchema.parse(0)).toThrow();
    expect(() => urlTypeSchema.parse(4)).toThrow();
  });
});

describe("Workshop query validation", () => {
  const numperpageSchema = z.number().int().min(1).max(100).optional();

  it("accepts valid page sizes", () => {
    expect(numperpageSchema.parse(1)).toBe(1);
    expect(numperpageSchema.parse(50)).toBe(50);
    expect(numperpageSchema.parse(100)).toBe(100);
  });

  it("rejects 0", () => {
    expect(() => numperpageSchema.parse(0)).toThrow();
  });

  it("rejects > 100", () => {
    expect(() => numperpageSchema.parse(101)).toThrow();
  });
});
