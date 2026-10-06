/**
 * MORPHOS v2 looks — colourings of the reaction–diffusion field itself.
 * After Karl Sims' RD Tool (multi-stop colour maps, emboss lighting, style
 * maps that vary feed/kill across the grid, orientation, flow) and the
 * MEMETiC MUSiC (@m3metic) palette: temple gold relief with a rainbow
 * mandala core, liquid rainbow chrome, teal beams, UV mandala, full-field
 * projection. Sharp first: crisp iso-edges, no blur of the field.
 */
export type VisualId =
  | "off"
  | "marble"
  | "temple-gold"
  | "chrome-bloom"
  | "teal-beam"
  | "uv-mandala"
  | "projection"
  | "cymatic";

export type RGB = [number, number, number];

/** Spatial style map: where the second pattern regime appears. */
export type VaryMode = "none" | "radial" | "ring" | "noise" | "vertical" | "chladni";
export const VARY_INDEX: Record<VaryMode, number> = { none: 0, radial: 1, ring: 2, noise: 3, vertical: 4, chladni: 5 };

/** 0 none · 1 mandala core (centre only) · 2 full-domain kaleidoscope. */
export type KaleidoMode = 0 | 1 | 2;

export type VisualPreset = {
  id: VisualId;
  name: string;
  blurb: string;
  /** Shader material index (render pass). */
  material: number;
  /** Multi-stop colour map, dark → light (null = species palette). */
  stops: RGB[] | null;
  /** Accent map (mandala core, iridescent threads). */
  accent: RGB[];
  /** Colour map repeats across concentration (Sims "frequency"). */
  frequency: number;
  /** Mirror (true) or wrap the repeats. */
  mirror: boolean;
  contrast: number;
  saturation: number;
  /** Height-map lighting strength (emboss). */
  emboss: number;
  specular: number;
  /** Crisp iso-edge (thread) emphasis. */
  edge: number;
  /** How hard the iso threshold is (0 soft gradient … 1 binary, anti-aliased). */
  crisp: number;
  kaleido: KaleidoMode;
  foldBase: number;
  bloom: number;
  haze: number;
  grain: number;
  vignette: number;
  hazeTint: RGB;
  /** RD drivers. */
  vary: VaryMode;
  varyAmount: number;
  /** Anisotropic diffusion base strength (orientation). */
  aniso: number;
  /** Swirl flow (projection-style motion). */
  swirl: number;
  /** n-fold symmetric seeding for onsets (0 = off). */
  symmetry: number;
  swatch: string;
};

const base = {
  accent: [
    [1, 0.1, 0.55],
    [1, 0.55, 0.05],
    [0.1, 0.9, 1],
    [0.5, 0.2, 1],
    [1, 0.1, 0.55],
  ] as RGB[],
  frequency: 1,
  mirror: true,
  contrast: 1,
  saturation: 1,
  emboss: 0.35,
  specular: 0.2,
  edge: 0.35,
  crisp: 0.65,
  kaleido: 0 as KaleidoMode,
  foldBase: 6,
  bloom: 0.25,
  haze: 0.08,
  grain: 0.025,
  vignette: 0.35,
  hazeTint: [0.3, 0.35, 0.45] as RGB,
  vary: "none" as VaryMode,
  varyAmount: 0,
  aniso: 0,
  swirl: 0,
  symmetry: 0,
};

export const VISUALS: VisualPreset[] = [
  {
    ...base,
    id: "off",
    name: "Field",
    blurb: "Species palette, sharpened",
    material: 0,
    stops: null,
    swatch: "linear-gradient(135deg,#03060f,#0a3a5a)",
  },
  {
    ...base,
    id: "marble",
    name: "Marble",
    blurb: "Silver veins, ink flow",
    material: 1,
    stops: [
      [0.01, 0.012, 0.018],
      [0.12, 0.13, 0.15],
      [0.55, 0.58, 0.63],
      [0.93, 0.94, 0.96],
      [0.35, 0.37, 0.42],
      [0.98, 0.98, 1],
    ],
    frequency: 2.5,
    emboss: 0.45,
    specular: 0.45,
    edge: 0.6,
    crisp: 0.45,
    vary: "noise",
    varyAmount: 0.55,
    aniso: 0.12,
    swirl: 0.25,
    hazeTint: [0.55, 0.6, 0.7],
    swatch: "linear-gradient(135deg,#050608,#9aa3ad 55%,#f2f4f7)",
  },
  {
    ...base,
    id: "temple-gold",
    name: "Temple Gold",
    blurb: "Embossed filigree, rainbow core",
    material: 2,
    stops: [
      [0.03, 0.015, 0.004],
      [0.22, 0.12, 0.03],
      [0.62, 0.4, 0.12],
      [0.95, 0.76, 0.36],
      [1, 0.93, 0.7],
    ],
    emboss: 1,
    specular: 0.85,
    edge: 0.25,
    crisp: 0.8,
    kaleido: 1,
    foldBase: 8,
    bloom: 0.35,
    haze: 0.1,
    vary: "radial",
    varyAmount: 0.8,
    symmetry: 8,
    hazeTint: [0.55, 0.38, 0.12],
    swatch: "radial-gradient(circle,#7fd1ff 0,#c86bff 14%,#d9a441 28%,#4a300c 70%,#0b0703)",
  },
  {
    ...base,
    id: "chrome-bloom",
    name: "Chrome Bloom",
    blurb: "Liquid rainbow metal",
    material: 3,
    stops: [
      [1, 0.08, 0.6],
      [1, 0.52, 0.05],
      [0.05, 0.85, 1],
      [0.45, 0.15, 0.95],
      [1, 0.08, 0.6],
    ],
    frequency: 1.6,
    mirror: false,
    saturation: 1.15,
    emboss: 0.9,
    specular: 1,
    edge: 0.2,
    crisp: 0.55,
    bloom: 0.35,
    haze: 0.04,
    vary: "noise",
    varyAmount: 0.6,
    swirl: 0.4,
    hazeTint: [0.6, 0.2, 0.6],
    swatch: "linear-gradient(135deg,#ff1f9a,#ff8a12 30%,#ffffff 45%,#18d6ff 62%,#7a2cff)",
  },
  {
    ...base,
    id: "teal-beam",
    name: "Teal Beam",
    blurb: "Light shafts through the growth",
    material: 4,
    stops: [
      [0, 0.01, 0.012],
      [0, 0.12, 0.13],
      [0.02, 0.5, 0.5],
      [0.25, 0.95, 0.9],
      [0.85, 1, 0.98],
    ],
    emboss: 0.3,
    specular: 0.3,
    edge: 0.75,
    crisp: 0.75,
    bloom: 0.5,
    haze: 0.4,
    grain: 0.035,
    vary: "vertical",
    varyAmount: 0.6,
    aniso: 0.3,
    hazeTint: [0.05, 0.55, 0.55],
    swatch: "linear-gradient(160deg,#00110f,#0fb5ad 50%,#001a1a)",
  },
  {
    ...base,
    id: "uv-mandala",
    name: "UV Mandala",
    blurb: "Kaleidoscopic growth, violet stage",
    material: 5,
    stops: [
      [0.02, 0, 0.05],
      [0.2, 0.02, 0.4],
      [0.6, 0.1, 0.95],
      [1, 0.25, 0.85],
      [1, 0.85, 1],
    ],
    saturation: 1.1,
    emboss: 0.5,
    specular: 0.4,
    edge: 0.6,
    crisp: 0.8,
    kaleido: 2,
    foldBase: 6,
    bloom: 0.45,
    haze: 0.18,
    vary: "ring",
    varyAmount: 0.7,
    symmetry: 6,
    hazeTint: [0.45, 0.08, 0.6],
    swatch: "radial-gradient(circle,#ffffff 0,#ff3df5 20%,#6a1bd8 50%,#12001f)",
  },
  {
    ...base,
    id: "projection",
    name: "Projection",
    blurb: "Edge-to-edge psychedelic flow",
    material: 6,
    stops: [
      [0.02, 0.0, 0.08],
      [0.45, 0.05, 0.9],
      [1, 0.1, 0.5],
      [1, 0.6, 0.05],
      [0.95, 1, 0.3],
      [0.1, 0.95, 0.7],
      [0.05, 0.5, 1],
    ],
    frequency: 2.2,
    saturation: 1.2,
    emboss: 0.4,
    specular: 0.35,
    edge: 0.45,
    crisp: 0.7,
    bloom: 0.3,
    vary: "noise",
    varyAmount: 0.75,
    aniso: 0.18,
    swirl: 1,
    hazeTint: [0.3, 0.4, 0.5],
    swatch: "linear-gradient(135deg,#2a0b5a,#ff1f80 35%,#ffb10a 55%,#19e0b0 75%,#1478ff)",
  },
  {
    ...base,
    id: "cymatic",
    name: "Cymatic",
    blurb: "The sound's standing waves steer growth",
    material: 7,
    stops: [
      [0.02, 0.03, 0.03],
      [0.1, 0.2, 0.2],
      [0.85, 0.65, 0.3],
      [1, 0.95, 0.8],
    ],
    emboss: 0.6,
    specular: 0.5,
    edge: 0.5,
    crisp: 0.8,
    vary: "chladni",
    varyAmount: 0.85,
    bloom: 0.35,
    haze: 0.12,
    hazeTint: [0.2, 0.4, 0.45],
    swatch: "repeating-radial-gradient(circle,#06100f 0,#06100f 6px,#d8b56a 7px,#06100f 9px)",
  },
];

export function visualById(id: string): VisualPreset {
  return VISUALS.find((v) => v.id === id) ?? VISUALS[0]!;
}

/** Four-stop reduction of a look, for the WebGL2 fallback palette path. */
export function fourStops(p: VisualPreset): [RGB, RGB, RGB, RGB] | null {
  if (!p.stops) return null;
  const s = p.stops;
  const at = (t: number): RGB => {
    const x = t * (s.length - 1);
    const i = Math.min(s.length - 2, Math.floor(x));
    const f = x - i;
    const a = s[i]!;
    const b = s[i + 1]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
  return [at(0), at(0.34), at(0.67), at(1)];
}
