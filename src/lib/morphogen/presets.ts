export type ImageMode = "develop" | "inoculate" | "resist" | "palette";

export type Palette = {
  id: string;
  name: string;
  /** Four RGB stops, 0–1, dark → light */
  stops: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
};

export type SimPreset = {
  id: string;
  name: string;
  blurb: string;
  feed: number;
  kill: number;
  du: number;
  dv: number;
  paletteId: string;
};

export const PALETTES: Palette[] = [
  {
    id: "spore",
    name: "Spore",
    stops: [
      [0.02, 0.035, 0.03],
      [0.08, 0.22, 0.16],
      [0.55, 0.72, 0.5],
      [0.9, 0.94, 0.84],
    ],
  },
  {
    id: "abyss",
    name: "Abyss",
    stops: [
      [0.01, 0.02, 0.05],
      [0.04, 0.16, 0.26],
      [0.22, 0.58, 0.64],
      [0.82, 0.92, 0.94],
    ],
  },
  {
    id: "porcelain",
    name: "Porcelain",
    stops: [
      [0.82, 0.8, 0.74],
      [0.55, 0.5, 0.44],
      [0.22, 0.18, 0.15],
      [0.06, 0.05, 0.04],
    ],
  },
  {
    id: "ember",
    name: "Ember",
    stops: [
      [0.04, 0.02, 0.015],
      [0.28, 0.08, 0.05],
      [0.72, 0.32, 0.12],
      [0.94, 0.84, 0.68],
    ],
  },
  {
    id: "chlorophyll",
    name: "Chlorophyll",
    stops: [
      [0.02, 0.04, 0.02],
      [0.05, 0.18, 0.08],
      [0.18, 0.55, 0.22],
      [0.78, 0.92, 0.55],
    ],
  },
  {
    id: "silver",
    name: "Silver",
    stops: [
      [0.04, 0.045, 0.05],
      [0.18, 0.2, 0.22],
      [0.55, 0.58, 0.6],
      [0.92, 0.93, 0.93],
    ],
  },
];

export const PRESETS: SimPreset[] = [
  { id: "mitosis", name: "Mitosis", blurb: "Soft dividing cells", feed: 0.0367, kill: 0.0649, du: 0.16, dv: 0.08, paletteId: "abyss" },
  { id: "solitons", name: "Solitons", blurb: "Quiet stable spots", feed: 0.0353, kill: 0.0653, du: 0.16, dv: 0.08, paletteId: "spore" },
  { id: "pulsing", name: "Pulsing", blurb: "Breathing spots", feed: 0.025, kill: 0.06, du: 0.14, dv: 0.07, paletteId: "spore" },
  { id: "holes", name: "Holes", blurb: "Perforated sheet", feed: 0.039, kill: 0.058, du: 0.16, dv: 0.08, paletteId: "abyss" },
  { id: "mazes", name: "Mazes", blurb: "Labyrinth walls", feed: 0.029, kill: 0.057, du: 0.16, dv: 0.08, paletteId: "porcelain" },
  { id: "fingerprint", name: "Fingerprint", blurb: "Ridge fields", feed: 0.026, kill: 0.061, du: 0.16, dv: 0.08, paletteId: "porcelain" },
  { id: "spirals", name: "Spirals", blurb: "Rotating arms", feed: 0.018, kill: 0.051, du: 0.16, dv: 0.08, paletteId: "ember" },
  { id: "worms", name: "Worms", blurb: "Wandering filaments", feed: 0.046, kill: 0.063, du: 0.16, dv: 0.08, paletteId: "chlorophyll" },
  { id: "coral", name: "Coral", blurb: "Branching reefs", feed: 0.0545, kill: 0.062, du: 0.16, dv: 0.08, paletteId: "abyss" },
  { id: "uskate", name: "Skate", blurb: "U-skate world", feed: 0.062, kill: 0.0609, du: 0.16, dv: 0.08, paletteId: "ember" },
];

export const DEFAULT_PRESET = PRESETS[0]!;

export const WAVEFORMS = [
  { id: "sine", name: "Sine", tag: "HUM", blurb: "The Hum · Schumann" },
  { id: "triangle", name: "Triangle", tag: "TRI", blurb: "Soft odd harmonics" },
  { id: "sawtooth", name: "Saw", tag: "SAW", blurb: "Bright ramp" },
  { id: "square", name: "Square", tag: "SQR", blurb: "Hollow pulse" },
  { id: "pulse", name: "Pulse", tag: "PLS", blurb: "Narrow duty" },
  { id: "spectrum", name: "Spectrum", tag: "SPEC", blurb: "Field as partials" },
] as const;

export type WaveformId = (typeof WAVEFORMS)[number]["id"];

export const DEFAULT_WAVEFORM: WaveformId = "sine";

export function waveformById(id: string): (typeof WAVEFORMS)[number] {
  return WAVEFORMS.find((w) => w.id === id) ?? WAVEFORMS[0]!;
}

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function presetById(id: string): SimPreset {
  return PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
}

export type SimParams = {
  feed: number;
  kill: number;
  du: number;
  dv: number;
  speed: number;
  brushSize: number;
  brushStrength: number;
  imageMix: number;
  imageMode: ImageMode;
  paletteId: string;
  glow: number;
  vignette: number;
  steps: number;
};

export const DEFAULT_PARAMS: SimParams = {
  feed: DEFAULT_PRESET.feed,
  kill: DEFAULT_PRESET.kill,
  du: DEFAULT_PRESET.du,
  dv: DEFAULT_PRESET.dv,
  speed: 1.16,
  brushSize: 0.072,
  brushStrength: 1,
  imageMix: 0.35,
  imageMode: "inoculate",
  paletteId: DEFAULT_PRESET.paletteId,
  glow: 1.28,
  vignette: 0.14,
  steps: 6,
};

export const MAX_BRUSHES = 8;

export type Brush = {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  size: number;
  strength: number;
  pressure: number;
  radius: number;
};

export type FieldStats = {
  meanU: number;
  meanV: number;
  energy: number;
  cx: number;
  cy: number;
  edge: number;
  /** 16×16 V samples, 0–1 */
  grid: Float32Array;
};

export function emptyStats(): FieldStats {
  return {
    meanU: 1,
    meanV: 0,
    energy: 0,
    cx: 0.5,
    cy: 0.5,
    edge: 0,
    grid: new Float32Array(256),
  };
}

export function pickSimMaxSide(): number {
  if (typeof window === "undefined") return 1440;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 720;
  const longPx = Math.max(w, h) * dpr;
  const mobile =
    window.matchMedia("(max-width: 640px)").matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (mobile) return Math.max(960, Math.min(1600, Math.round(longPx * 0.78)));
  return Math.max(1440, Math.min(2160, Math.round(longPx * 0.92)));
}