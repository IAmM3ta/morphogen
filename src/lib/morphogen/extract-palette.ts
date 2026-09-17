import type { Palette } from "./presets";

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-5) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max < 1e-5 ? 0 : d / max;
  return [h, s, max];
}

/** Sample an image into four luminance-sorted RGB stops for the field colormap. */
export function extractPaletteFromImage(source: CanvasImageSource, id = "image"): Palette {
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      id,
      name: "Image",
      stops: [
        [0.04, 0.04, 0.05],
        [0.18, 0.2, 0.22],
        [0.5, 0.52, 0.5],
        [0.9, 0.9, 0.88],
      ],
    };
  }
  ctx.drawImage(source, 0, 0, 48, 48);
  const { data } = ctx.getImageData(0, 0, 48, 48);
  const pixels: { r: number; g: number; b: number; lum: number; sat: number }[] = [];
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const [, s, v] = rgbToHsv(r, g, b);
    pixels.push({ r, g, b, lum: 0.299 * r + 0.587 * g + 0.114 * b, sat: s * v });
  }
  pixels.sort((a, b) => a.lum - b.lum);
  const pick = (t: number) => {
    const i = Math.min(pixels.length - 1, Math.floor(t * (pixels.length - 1)));
    const p = pixels[i]!;
    return [p.r, p.g, p.b] as [number, number, number];
  };
  return {
    id,
    name: "Image",
    stops: [pick(0.06), pick(0.32), pick(0.64), pick(0.94)],
  };
}
