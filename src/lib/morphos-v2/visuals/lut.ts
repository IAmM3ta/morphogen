import type { RGB, VisualPreset } from "./presets";

export const LUT_W = 256;

function sampleStops(stops: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  // smootherstep between stops keeps bands crisp but seamless
  const g = f * f * f * (f * (f * 6 - 15) + 10);
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, a[2] + (b[2] - a[2]) * g];
}

function grade(c: RGB, contrast: number, saturation: number): RGB {
  const l = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const out: RGB = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    let v = l + (c[k]! - l) * saturation;
    v = (v - 0.5) * contrast + 0.5;
    out[k] = Math.max(0, Math.min(1, v));
  }
  return out;
}

/**
 * Two-row RGBA8 LUT: row 0 = main colour map (with the Sims-style
 * frequency/mirror repeats baked in), row 1 = accent map.
 */
export function buildLut(p: VisualPreset, speciesStops: RGB[]): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(new ArrayBuffer(LUT_W * 2 * 4));
  const main = p.stops ?? speciesStops;
  for (let i = 0; i < LUT_W; i++) {
    const t = i / (LUT_W - 1);
    let x = t * p.frequency;
    if (p.mirror) {
      const m = x % 2;
      x = m > 1 ? 2 - m : m;
    } else {
      x = x % 1;
    }
    if (p.frequency <= 1) x = t;
    const c = grade(sampleStops(main, x), p.contrast, p.saturation);
    const a = sampleStops(p.accent, t);
    const o = i * 4;
    data[o] = Math.round(c[0] * 255);
    data[o + 1] = Math.round(c[1] * 255);
    data[o + 2] = Math.round(c[2] * 255);
    data[o + 3] = 255;
    const o2 = (LUT_W + i) * 4;
    data[o2] = Math.round(a[0] * 255);
    data[o2 + 1] = Math.round(a[1] * 255);
    data[o2 + 2] = Math.round(a[2] * 255);
    data[o2 + 3] = 255;
  }
  return data;
}
