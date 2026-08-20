export type HeroHeuristicFlags = {
  ribbon: boolean;
  seam: boolean;
  wordmarkFail: boolean;
  wordmarkWarn: boolean;
};

function chroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
): [number, number, number] {
  const i = (y * width + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2]];
}

function bandMeanChroma(
  rgba: Uint8Array,
  width: number,
  height: number,
  y0: number,
  y1: number,
): number {
  let sum = 0;
  let n = 0;
  const stepX = Math.max(1, Math.floor(width / 480));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 24));
  for (let y = y0; y < y1; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const [r, g, b] = pixel(rgba, width, x, y);
      sum += chroma(r, g, b);
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function seamScore(rgba: Uint8Array, width: number, height: number): number {
  const mid = Math.floor(width / 2);
  if (mid < 2) {
    return 0;
  }
  const stepY = Math.max(1, Math.floor(height / 310));
  let midSum = 0;
  let ctrlSum = 0;
  let n = 0;
  const ctrl = Math.max(1, Math.floor(width / 4));
  for (let y = 0; y < height; y += stepY) {
    const [r0, g0, b0] = pixel(rgba, width, mid - 1, y);
    const [r1, g1, b1] = pixel(rgba, width, mid, y);
    midSum += Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1);
    const [cr0, cg0, cb0] = pixel(rgba, width, ctrl - 1, y);
    const [cr1, cg1, cb1] = pixel(rgba, width, ctrl, y);
    ctrlSum += Math.abs(cr0 - cr1) + Math.abs(cg0 - cg1) + Math.abs(cb0 - cb1);
    n += 1;
  }
  if (n === 0) {
    return 0;
  }
  const midMean = midSum / n;
  const ctrlMean = Math.max(1, ctrlSum / n);
  return midMean / ctrlMean;
}

function edgeDensity(rgba: Uint8Array, width: number, height: number): number {
  const stepX = Math.max(1, Math.floor(width / 960));
  const stepY = Math.max(1, Math.floor(height / 310));
  let edges = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += stepY) {
    for (let x = 1; x < width - 1; x += stepX) {
      const [r, g, b] = pixel(rgba, width, x, y);
      const [rx, gx, bx] = pixel(rgba, width, x + 1, y);
      const [ry, gy, by] = pixel(rgba, width, x, y + 1);
      const grad =
        Math.abs(r - rx) +
        Math.abs(g - gx) +
        Math.abs(b - bx) +
        Math.abs(r - ry) +
        Math.abs(g - gy) +
        Math.abs(b - by);
      const L = luma(r, g, b);
      if (grad > 180 && (L > 160 || L < 50)) {
        edges += 1;
      }
      n += 1;
    }
  }
  return n === 0 ? 0 : edges / n;
}

export function analyzeHero(rgba: Uint8Array, width: number, height: number): HeroHeuristicFlags {
  const band = Math.max(1, Math.floor(height * 0.12));
  const topChroma = bandMeanChroma(rgba, width, height, 0, band);
  const botChroma = bandMeanChroma(rgba, width, height, height - band, height);
  const midChroma = bandMeanChroma(
    rgba,
    width,
    height,
    Math.floor(height * 0.25),
    Math.floor(height * 0.75),
  );
  const ribbon =
    (topChroma > 80 && topChroma > midChroma * 2.2) ||
    (botChroma > 80 && botChroma > midChroma * 2.2);

  const seamRatio = seamScore(rgba, width, height);
  const seam = seamRatio > 3.2;

  const edges = edgeDensity(rgba, width, height);
  const wordmarkFail = edges > 0.12;
  const wordmarkWarn = !wordmarkFail && edges > 0.04;

  return { ribbon, seam, wordmarkFail, wordmarkWarn };
}
