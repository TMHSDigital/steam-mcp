import { deflateSync, inflateSync } from "node:zlib";

export type DecodedImage = {
  width: number;
  height: number;
  format: "png" | "jpeg";
  hasAlpha: boolean;
  /** Row-major RGBA, present only when PNG pixels were decoded. */
  rgba?: Uint8Array;
};

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function parseImage(buf: Buffer, decodePixels: boolean): DecodedImage {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) {
    return parsePng(buf, decodePixels);
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    return parseJpeg(buf);
  }
  throw new Error("File is not a PNG or JPEG.");
}

function parseJpeg(buf: Buffer): DecodedImage {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      break;
    }
    const size = buf.readUInt16BE(i + 2);
    if (size < 2) {
      break;
    }
    // SOF0 / SOF1 / SOF2
    if (marker >= 0xc0 && marker <= 0xc2) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height, format: "jpeg", hasAlpha: false };
    }
    i += 2 + size;
  }
  throw new Error("JPEG is missing a Start of Frame marker.");
}

function parsePng(buf: Buffer, decodePixels: boolean): DecodedImage {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let hasTrns = false;
  const idat: Buffer[] = [];

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) {
      throw new Error("PNG chunk is truncated.");
    }
    const data = buf.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "tRNS") {
      hasTrns = true;
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height) {
    throw new Error("PNG is missing IHDR.");
  }

  const hasAlpha = colorType === 4 || colorType === 6 || hasTrns;
  const result: DecodedImage = {
    width,
    height,
    format: "png",
    hasAlpha,
  };

  if (!decodePixels) {
    return result;
  }

  if (interlace !== 0) {
    throw new Error("Interlaced PNG is not supported.");
  }
  if (bitDepth !== 8) {
    throw new Error(`PNG bit depth ${bitDepth} is not supported (need 8).`);
  }
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`PNG color type ${colorType} is not supported (need RGB or RGBA).`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idat));
  result.rgba = unfilterPng(inflated, width, height, channels);
  return result;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function unfilterPng(
  inflated: Buffer,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const stride = width * channels;
  const rowBytes = stride + 1;
  if (inflated.length < rowBytes * height) {
    throw new Error("PNG IDAT is too small for the declared size.");
  }

  const rgba = new Uint8Array(width * height * 4);
  const recon = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowOff = y * rowBytes;
    const filter = inflated[rowOff];
    const src = inflated.subarray(rowOff + 1, rowOff + 1 + stride);

    for (let x = 0; x < stride; x++) {
      const raw = src[x];
      const a = x >= channels ? recon[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val: number;
      switch (filter) {
        case 0:
          val = raw;
          break;
        case 1:
          val = (raw + a) & 0xff;
          break;
        case 2:
          val = (raw + b) & 0xff;
          break;
        case 3:
          val = (raw + ((a + b) >> 1)) & 0xff;
          break;
        case 4:
          val = (raw + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter ${filter}.`);
      }
      recon[x] = val;
    }

    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      rgba[di] = recon[si];
      rgba[di + 1] = recon[si + 1];
      rgba[di + 2] = recon[si + 2];
      rgba[di + 3] = channels === 4 ? recon[si + 3] : 255;
    }

    prev.set(recon);
  }

  return rgba;
}

/** Encode 8-bit RGB or RGBA PNG. Used by tests. */
export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array,
  withAlpha: boolean,
): Buffer {
  const channels = withAlpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(stride + 1) * y] = 0;
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = (stride + 1) * y + 1 + x * channels;
      raw[di] = rgba[si];
      raw[di + 1] = rgba[si + 1];
      raw[di + 2] = rgba[si + 2];
      if (withAlpha) {
        raw[di + 3] = rgba[si + 3];
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = withAlpha ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = crc32(Buffer.concat([typeBuf, data]));
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcBuf, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
