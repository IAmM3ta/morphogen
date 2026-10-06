/**
 * Loop-track model: four scenes (A–D), each a one-bar, 16-step pattern for
 * kick / clap / hat / perc / bass, plus a drone automation lane that can run
 * 1, 2 or 4 bars. Pure data + helpers; persisted to localStorage.
 */
import type { BassStyle } from "./bass";

export const STEPS = 16;
export const AUTO_RES = 64; // automation slots per bar
export const LANES = ["kick", "clap", "hat", "perc", "bass", "drone"] as const;
export type LaneId = (typeof LANES)[number];
export type DrumLane = "kick" | "clap" | "hat" | "perc";
export const DRUM_LANES: DrumLane[] = ["kick", "clap", "hat", "perc"];
export const SCENES = ["A", "B", "C", "D"] as const;
export type SceneId = (typeof SCENES)[number];

export type BassStep = { on: boolean; degree: number; accent: boolean; slide: boolean };

/** Automation sample: y (pitch pos), x (timbre), gate (0 = silent). */
export type AutoLane = { bars: 1 | 2 | 4; y: number[]; x: number[]; g: number[]; used: boolean };

export type Pattern = {
  /** 0 = off, 1 = on, 2 = accent (hat: 2 = open). */
  kick: number[];
  clap: number[];
  hat: number[];
  perc: number[];
  bass: BassStep[];
  auto: AutoLane;
};

export type LoopState = {
  version: 1;
  bpm: number;
  swing: number;
  bassStyle: BassStyle;
  scene: SceneId;
  scenes: Record<SceneId, Pattern>;
  mute: Record<LaneId, boolean>;
  solo: LaneId | null;
};

const zeros = (n = STEPS) => Array.from({ length: n }, () => 0);

export function emptyAuto(bars: 1 | 2 | 4 = 2): AutoLane {
  const n = bars * AUTO_RES;
  return { bars, y: Array(n).fill(0.5), x: Array(n).fill(0.4), g: Array(n).fill(0), used: false };
}

export function emptyPattern(): Pattern {
  return {
    kick: zeros(),
    clap: zeros(),
    hat: zeros(),
    perc: zeros(),
    bass: Array.from({ length: STEPS }, () => ({ on: false, degree: 0, accent: false, slide: false })),
    auto: emptyAuto(2),
  };
}

function pat(def: Partial<Record<DrumLane, string>>, bass: string, degrees: number[]): Pattern {
  const p = emptyPattern();
  const parse = (s: string) => s.split("").slice(0, STEPS).map((c) => (c === "x" ? 1 : c === "X" || c === "o" ? 2 : 0));
  for (const lane of DRUM_LANES) if (def[lane]) p[lane] = parse(def[lane]!);
  // Bass string: . off, n note, A accent, s slide, S accent+slide
  bass.split("").slice(0, STEPS).forEach((c, i) => {
    if (c === ".") return;
    p.bass[i] = { on: true, degree: degrees[i] ?? 0, accent: c === "A" || c === "S", slide: c === "s" || c === "S" };
  });
  return p;
}

/** Starter scenes so the first press of Play sounds like music. */
export function factoryLoop(): LoopState {
  return {
    version: 1,
    bpm: 122,
    swing: 0.12,
    bassStyle: "acid",
    scene: "A",
    scenes: {
      A: pat(
        { kick: "x...x...x...x...", hat: "..x...x...x...xo", clap: "....x.......x...", perc: ".......x......x." },
        "n.nA.sn.n.As.nn.",
        [0, 0, 0, 7, 0, 3, 4, 0, 0, 0, 2, 4, 0, 0, -1, 0],
      ),
      B: pat(
        { kick: "x.....x...x.....", hat: "x.x.x.x.x.x.x.xo", clap: "....x.......x..x", perc: "..x.....x.....x." },
        "n...n.s.n...A.s.",
        [0, 0, 0, 0, -2, 0, -1, 0, 0, 0, 0, 0, 3, 0, 2, 0],
      ),
      C: pat({ kick: "x.......x.......", hat: "....x.......x...", perc: "x..x..x...x..x.." }, "n.......n.......", [0, 0, 0, 0, 0, 0, 0, 0, -3, 0, 0, 0, 0, 0, 0, 0]),
      D: emptyPattern(),
    },
    mute: { kick: false, clap: false, hat: false, perc: false, bass: false, drone: false },
    solo: null,
  };
}

const KEY = "morphos-v2-loop";

export function loadLoop(): LoopState {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return factoryLoop();
    const parsed = JSON.parse(raw) as LoopState;
    if (!parsed || parsed.version !== 1 || !parsed.scenes) return factoryLoop();
    return sanitize(parsed);
  } catch {
    return factoryLoop();
  }
}

export function saveLoop(s: LoopState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota or private mode */
  }
}

function sanitize(s: LoopState): LoopState {
  const f = factoryLoop();
  const out: LoopState = { ...f, ...s, scenes: { ...f.scenes } };
  for (const id of SCENES) {
    const p = s.scenes[id];
    if (!p) continue;
    const fix = (a: unknown) => (Array.isArray(a) && a.length === STEPS ? a.map((v) => (Number(v) > 0 ? Math.min(2, Number(v)) : 0)) : zeros());
    const bars = p.auto?.bars === 1 || p.auto?.bars === 4 ? p.auto.bars : 2;
    const n = bars * AUTO_RES;
    const okArr = (a: unknown, d: number) => (Array.isArray(a) && a.length === n ? a.map((v) => (Number.isFinite(Number(v)) ? Number(v) : d)) : Array(n).fill(d));
    out.scenes[id] = {
      kick: fix(p.kick),
      clap: fix(p.clap),
      hat: fix(p.hat),
      perc: fix(p.perc),
      bass:
        Array.isArray(p.bass) && p.bass.length === STEPS
          ? p.bass.map((b) => ({ on: Boolean(b?.on), degree: Number(b?.degree) || 0, accent: Boolean(b?.accent), slide: Boolean(b?.slide) }))
          : emptyPattern().bass,
      auto: { bars, y: okArr(p.auto?.y, 0.5), x: okArr(p.auto?.x, 0.4), g: okArr(p.auto?.g, 0), used: Boolean(p.auto?.used) },
    };
  }
  out.bpm = Math.max(40, Math.min(200, Number(s.bpm) || 122));
  out.swing = Math.max(0, Math.min(0.6, Number(s.swing) || 0));
  out.mute = { ...f.mute, ...(s.mute ?? {}) };
  if (!SCENES.includes(out.scene)) out.scene = "A";
  return out;
}

export function clonePattern(p: Pattern): Pattern {
  return JSON.parse(JSON.stringify(p)) as Pattern;
}

export function laneAudible(s: LoopState, lane: LaneId): boolean {
  if (s.solo) return s.solo === lane;
  return !s.mute[lane];
}

/** Resize an automation lane, tiling existing content. */
export function resizeAuto(a: AutoLane, bars: 1 | 2 | 4): AutoLane {
  if (a.bars === bars) return a;
  const n = bars * AUTO_RES;
  const src = a.y.length;
  const pick = <T,>(arr: T[]) => Array.from({ length: n }, (_, i) => arr[i % src]!);
  return { bars, y: pick(a.y), x: pick(a.x), g: pick(a.g), used: a.used };
}
