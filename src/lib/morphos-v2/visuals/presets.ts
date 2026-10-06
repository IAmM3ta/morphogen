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
  | "cymatic"
  | "iridescent"
  | "oscillators"
  | "hex-cymatic"
  | "fluidica";

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
  /** Lighting pass (materials 8+). Legacy looks keep their own shading. */
  light: LightParams;
  /** Ripple layer coupling: UV refraction, feed/kill nudges, normal gain. */
  ripple: { refract: number; feed: number; kill: number; normal: number };
  /** Pull the main chemistry toward a regime (0 = species params). */
  regime: string | null;
  regimePull: number;
  /** Pattern size (diffusion) and solver speed multipliers. */
  scaleMul: number;
  speedMul: number;
  /** Grid: hex cells (Hex Cymatic) or diamond lattice pin (Fluidica). */
  grid: { kind: "none" | "hex" | "diamond"; n: number; width: number; glow: number };
  /** Modal sin(nx)·sin(my) overlay strength (Hex Cymatic). */
  modal: number;
  /** Breathing warp amplitude (UV units). */
  warp: number;
  /** Bloom: bright-pass threshold and weights of the ½, ¼, ⅛ levels. */
  bloomThreshold: number;
  bloomLevels: [number, number, number];
};

export type LightParams = {
  roughness: number;
  /** Thin-film iridescence strength (accent ramp indexed by Fresnel). */
  film: number;
  filmPhase: number;
  /** Wrap-diffuse amount (0 Lambert … 1 very soft). */
  wrap: number;
  /** Cavity ambient occlusion strength. */
  ao: number;
  /** HDR emissive gain (lines, webs, contours); > 1 feeds the bloom. */
  emissive: number;
  key: number;
  fill: number;
  keyColor: RGB;
  fillColor: RGB;
  /** Faux subsurface warmth on peaks. */
  sss: number;
  /** Fine normal noise (velvet). */
  normalNoise: number;
};

const LIGHT0: LightParams = {
  roughness: 0.4,
  film: 0,
  filmPhase: 0,
  wrap: 0.2,
  ao: 0,
  emissive: 1,
  key: 1,
  fill: 0.5,
  keyColor: [1, 0.8, 0.6],
  fillColor: [0.4, 0.7, 1],
  sss: 0,
  normalNoise: 0,
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
  light: LIGHT0,
  ripple: { refract: 0, feed: 0, kill: 0, normal: 0 },
  regime: null as string | null,
  regimePull: 0,
  scaleMul: 1,
  speedMul: 1,
  grid: { kind: "none" as "none" | "hex" | "diamond", n: 0, width: 0, glow: 0 },
  modal: 0,
  warp: 0,
  bloomThreshold: 0.55,
  bloomLevels: [1, 0, 0] as [number, number, number],
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
  // ---- Video-informed looks (Metta's inspiration videos, Oct 2026) ----
  {
    ...base,
    id: "iridescent",
    name: "Iridescent",
    blurb: "Thin-film liquid metal, slow and viscous",
    material: 8,
    stops: [
      [0.004, 0.006, 0.02],
      [0.01, 0.02, 0.06],
      [0.03, 0.06, 0.15],
      [0.07, 0.11, 0.24],
    ],
    accent: [
      [0.1, 0.95, 1],
      [0, 0.62, 0.78],
      [0.95, 0.12, 0.78],
      [1, 0.7, 0.18],
      [1, 0.42, 0.08],
      [0.1, 0.95, 1],
    ],
    emboss: 1,
    specular: 1,
    edge: 0.35,
    crisp: 0.5,
    bloom: 0.5,
    haze: 0.07,
    hazeTint: [0.95, 0.58, 0.42],
    vary: "noise",
    varyAmount: 0.5,
    aniso: 0.1,
    swirl: 0.35,
    light: {
      ...LIGHT0,
      roughness: 0.18,
      film: 1,
      wrap: 0.15,
      ao: 0.25,
      emissive: 1.1,
      key: 1.5,
      fill: 0.9,
      keyColor: [1, 0.55, 0.22],
      fillColor: [0.2, 0.8, 1],
    },
    ripple: { refract: 0.05, feed: 0.002, kill: 0.0012, normal: 0.8 },
    regime: "labyrinth",
    regimePull: 0.45,
    speedMul: 0.6,
    bloomThreshold: 0.9,
    bloomLevels: [0.6, 0.5, 0.4],
    swatch: "linear-gradient(135deg,#02040e,#0a1430 40%,#18e6ff 60%,#ff2fc0 75%,#ffb030)",
  },
  {
    ...base,
    id: "oscillators",
    name: "Oscillators",
    blurb: "Velvet papillae on rolling waves",
    material: 9,
    stops: [
      [0.06, 0.1, 0.15],
      [0.12, 0.24, 0.29],
      [0.34, 0.42, 0.43],
      [0.92, 0.66, 0.5],
      [1, 0.78, 0.42],
    ],
    emboss: 0.7,
    specular: 0.15,
    edge: 0,
    crisp: 0.35,
    bloom: 0.12,
    haze: 0.05,
    hazeTint: [0.85, 0.62, 0.48],
    vignette: 0.45,
    light: {
      ...LIGHT0,
      roughness: 0.65,
      wrap: 0.6,
      ao: 1,
      emissive: 0,
      key: 1.15,
      fill: 0.5,
      keyColor: [1, 0.84, 0.64],
      fillColor: [0.42, 0.6, 0.74],
      sss: 0.55,
      normalNoise: 0.12,
    },
    ripple: { refract: 0.025, feed: 0.0015, kill: 0.0008, normal: 0.4 },
    regime: "mitosis",
    regimePull: 0.9,
    scaleMul: 0.8,
    warp: 0.007,
    bloomThreshold: 0.85,
    bloomLevels: [1, 0.3, 0],
    swatch: "radial-gradient(circle at 35% 35%,#ffc77a 0,#eaa77f 18%,#566b6c 45%,#1d3a45 70%,#0e1922)",
  },
  {
    ...base,
    id: "hex-cymatic",
    name: "Hex Cymatic",
    blurb: "Amber hex grid, modal web, ripples from the beat",
    material: 10,
    stops: [
      [0.005, 0.003, 0.002],
      [0.05, 0.025, 0.01],
      [0.3, 0.13, 0.03],
      [0.95, 0.5, 0.1],
    ],
    accent: [
      [1, 0.42, 0.04],
      [1, 0.62, 0.15],
      [1, 0.82, 0.45],
      [1, 0.62, 0.15],
    ],
    emboss: 0.8,
    specular: 0.6,
    edge: 0.4,
    crisp: 0.75,
    bloom: 0.6,
    haze: 0.05,
    hazeTint: [0.5, 0.28, 0.08],
    vary: "chladni",
    varyAmount: 0.55,
    light: {
      ...LIGHT0,
      roughness: 0.22,
      wrap: 0.1,
      ao: 0.4,
      emissive: 2.2,
      key: 0.7,
      fill: 0.3,
      keyColor: [1, 0.62, 0.25],
      fillColor: [0.45, 0.32, 0.22],
    },
    ripple: { refract: 0.09, feed: 0.003, kill: 0.0015, normal: 1.2 },
    grid: { kind: "hex", n: 11, width: 0.03, glow: 0.45 },
    modal: 1,
    bloomThreshold: 0.7,
    bloomLevels: [0.7, 0.6, 0.5],
    swatch: "repeating-linear-gradient(60deg,#0a0502 0,#0a0502 7px,#ffa21a 8px,#0a0502 10px)",
  },
  {
    ...base,
    id: "fluidica",
    name: "Fluidica",
    blurb: "Gold lattice on dark liquid; a bass drop shatters it",
    material: 11,
    stops: [
      [0.031, 0.047, 0.086],
      [0.25, 0.1, 0.02],
      [0.851, 0.4, 0],
      [1, 0.78, 0.35],
      [1, 0.941, 0.702],
    ],
    emboss: 0.6,
    specular: 0.8,
    edge: 0.5,
    crisp: 0.8,
    bloom: 0.55,
    haze: 0.04,
    hazeTint: [0.35, 0.4, 0.5],
    vignette: 0.5,
    light: {
      ...LIGHT0,
      roughness: 0.14,
      wrap: 0.1,
      ao: 0.2,
      emissive: 1.5,
      key: 0.8,
      fill: 1,
      keyColor: [1, 0.92, 0.8],
      fillColor: [0.545, 0.616, 0.714],
    },
    ripple: { refract: 0.07, feed: 0.004, kill: 0.002, normal: 2.2 },
    regime: "coral",
    regimePull: 0.75,
    speedMul: 0.8,
    grid: { kind: "diamond", n: 9, width: 0.028, glow: 0 },
    bloomThreshold: 0.75,
    bloomLevels: [0.7, 0.55, 0.45],
    swatch: "repeating-linear-gradient(45deg,#080c16 0,#080c16 8px,#d96600 9px,#fff0b3 10px,#080c16 11px)",
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
