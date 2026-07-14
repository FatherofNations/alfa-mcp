/* Обработка PNG-экспортов из Figma (sharp): проверка непустоты, flood-fill
   чистка запечённого фона от краёв, rounded-rect маска, lossless WebP. */

import type sharpNS from "sharp";

type Sharp = typeof sharpNS;
let sharpMod: Sharp | null | undefined;

/* sharp — нативная зависимость; при сбое установки деградируем мягко
   (PNG сохраняется как есть, чистки пропускаются с предупреждением). */
export async function getSharp(): Promise<Sharp | null> {
  if (sharpMod !== undefined) return sharpMod;
  try {
    sharpMod = (await import("sharp")).default as unknown as Sharp;
  } catch {
    sharpMod = null;
  }
  return sharpMod;
}

export interface PngAnalysis {
  width: number;
  height: number;
  empty: boolean; // полностью прозрачный или 1×1
}

export async function analyzePng(buf: Buffer): Promise<PngAnalysis | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  const img = sharp(buf).ensureAlpha();
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 1 && height <= 1) return { width, height, empty: true };
  const stats = await img.stats();
  const alpha = stats.channels[3];
  return { width, height, empty: !alpha || alpha.max === 0 };
}

/* Flood-fill от краёв: убирает запечённый фон (цвет берётся из углов),
   не трогая совпадающие по цвету пиксели ВНУТРИ контента. */
export async function floodFillClean(buf: Buffer, tolerance = 12): Promise<Buffer | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const px = (x: number, y: number) => (y * w + x) * channels;

  // фон = медиана четырёх углов
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const bg = [0, 1, 2].map((c) => {
    const vals = corners.map((o) => data[o + c]).sort((a, b) => a - b);
    return (vals[1] + vals[2]) >> 1;
  });
  const isBg = (o: number) =>
    data[o + 3] > 0 &&
    Math.abs(data[o] - bg[0]) <= tolerance &&
    Math.abs(data[o + 1] - bg[1]) <= tolerance &&
    Math.abs(data[o + 2] - bg[2]) <= tolerance;

  const visited = new Uint8Array(w * h);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (!visited[i] && isBg(px(x, y))) {
      visited[i] = 1;
      queue.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  let cleared = 0;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    data[i * channels + 3] = 0; // прозрачность
    cleared++;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  if (cleared === 0) return buf;
  return sharp(data, { raw: { width: w, height: h, channels: channels as 4 } })
    .png()
    .toBuffer();
}

/* Маска скруглённого прямоугольника — для кнопок/карточек с запечёнными
   углами секции (срезает мусор в углах экспорта). */
export async function roundedMask(buf: Buffer, radius: number): Promise<Buffer | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return buf;
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );
  return sharp(buf)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/* Lossless WebP; вернёт null, если WebP не меньше исходного PNG. */
export async function toWebpIfSmaller(png: Buffer): Promise<Buffer | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  const webp = await sharp(png).webp({ lossless: true }).toBuffer();
  return webp.length < png.length ? webp : null;
}
