import { deflateSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { parseImage } from "../../storeAssets/png.js";
import { localPath } from "../../storeAssets/safePath.js";

// Image header and pixel parse errors (#128). The parser does not check CRCs,
// so chunks carry a zero CRC.
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer, declaredLength = data.length): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(declaredLength, 0);
  return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}

function ihdr(width: number, height: number): Buffer {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(width, 0);
  d.writeUInt32BE(height, 4);
  d[8] = 8; // bit depth
  d[9] = 2; // RGB
  return chunk("IHDR", d);
}

const png = (...chunks: Buffer[]) => Buffer.concat([SIG, ...chunks, chunk("IEND", Buffer.alloc(0))]);

describe("PNG parse errors", () => {
  it("an IDAT length past the end of the file is truncated", () => {
    const buf = Buffer.concat([SIG, ihdr(4, 4), chunk("IDAT", Buffer.alloc(4), 1000)]);
    expect(() => parseImage(buf, false)).toThrow("PNG chunk is truncated.");
  });

  it("no IHDR", () => {
    expect(() => parseImage(png(), false)).toThrow("PNG is missing IHDR.");
  });

  it("random IDAT bytes are corrupt", () => {
    const buf = png(ihdr(4, 4), chunk("IDAT", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])));
    expect(() => parseImage(buf, true)).toThrow(/PNG IDAT is corrupt/);
  });

  it("an IDAT that inflates short is too small", () => {
    const buf = png(ihdr(4, 4), chunk("IDAT", deflateSync(Buffer.alloc(5))));
    expect(() => parseImage(buf, true)).toThrow(/too small/);
  });

  it("header-only parsing ignores the image data", () => {
    const buf = png(ihdr(4, 4), chunk("IDAT", Buffer.from([1, 2, 3])));
    expect(parseImage(buf, false)).toMatchObject({ width: 4, height: 4, format: "png" });
  });
});

describe("JPEG parse", () => {
  const sof0 = (w: number, h: number) => {
    const b = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    b.writeUInt16BE(h, 5);
    b.writeUInt16BE(w, 7);
    return b;
  };

  it("scan data before any Start of Frame", () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08]), Buffer.alloc(16)]);
    expect(() => parseImage(buf, false)).toThrow("JPEG is missing a Start of Frame marker.");
  });

  it("skips FF fill bytes and standalone RST markers before SOF0", () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xff, 0xff]), // fill bytes
      Buffer.from([0xff, 0xd0]), // RST0: no length
      sof0(640, 360),
      Buffer.alloc(16),
    ]);
    expect(parseImage(buf, false)).toMatchObject({ width: 640, height: 360, format: "jpeg" });
  });
});

describe("localPath", () => {
  it("rejects a path of only spaces", () => {
    expect(() => localPath("   ")).toThrow("Path is empty.");
  });
});
