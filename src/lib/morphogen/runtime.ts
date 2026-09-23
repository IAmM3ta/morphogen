import {
  DEFAULT_PARAMS,
  DEFAULT_WAVEFORM,
  emptyStats,
  paletteById,
  type Brush,
  type FieldStats,
  type Palette,
  type SimParams,
  type WaveformId,
} from "./presets";
import { DEFAULT_KEY, DEFAULT_MODE, DEFAULT_PITCH_MAX, DEFAULT_PITCH_MIN, type KeyId, type ModeId } from "./theory";

export type Antenna = {
  x: number;
  y: number;
  on: boolean;
  pressure: number;
};

export type Sense = {
  roll: number;
  pitch: number;
  yaw: number;
  spin: number;
  gforce: number;
  heading: number;
  pressure: number;
  /** True when a real compass / absolute orientation is reporting. */
  compass: boolean;
};

export type MorphJob = {
  fromFeed: number;
  fromKill: number;
  fromDu: number;
  fromDv: number;
  fromStops: Palette["stops"];
  toFeed: number;
  toKill: number;
  toDu: number;
  toDv: number;
  toStops: Palette["stops"];
  t: number;
  dur: number;
};

export type Runtime = {
  params: SimParams;
  brushes: Brush[];
  antenna: Antenna;
  sense: Sense;
  flowX: number;
  flowY: number;
  pointerFlowX: number;
  pointerFlowY: number;
  pointerMotion: number;
  motion: number;
  mic: number;
  listen: number;
  bands: { rms: number; bass: number; mid: number; high: number; centroid: number };
  trackOn: boolean;
  stats: FieldStats;
  started: boolean;
  paused: boolean;
  hasImage: boolean;
  seedNonce: number;
  scatterNonce: number;
  customPalette: Palette | null;
  lockCount: number;
  morph: MorphJob | null;
  liveStops: Palette["stops"] | null;
  waveform: WaveformId;
  historyDepth: number;
  keyId: KeyId;
  modeId: ModeId;
  pitchMinHz: number;
  pitchMaxHz: number;
  /** Vibrato LFO in Hz. Depth 0 = off (default). */
  vibratoRate: number;
  vibratoDepth: number;
  /** Outer-billiard walk rate. 0 = hold (period 1). */
  orbitRate: number;
  orbitN: number;
  orbitRot: number;
  orbitDegrees: number[];
  orbitPeriod: number;
  /** Onset from the ambience, 0–1, decayed each frame. */
  beat: number;
  /** When false, pose does not tune the chemistry. */
  gyroOn: boolean;
  play: { amp: number; pitch: number; timbre: number };
};

export const DEFAULT_VIBRATO_RATE = 5.2;
export const DEFAULT_VIBRATO_DEPTH = 0;
export const DEFAULT_ORBIT_RATE = 0;
export const DEFAULT_LISTEN = 0.55;

export const runtime: Runtime = {
  params: { ...DEFAULT_PARAMS },
  brushes: [],
  antenna: { x: 0.5, y: 0.5, on: false, pressure: 0 },
  sense: { roll: 0, pitch: 0, yaw: 0, spin: 0, gforce: 0, heading: 0, pressure: 0, compass: false },
  flowX: 0,
  flowY: 0,
  pointerFlowX: 0,
  pointerFlowY: 0,
  pointerMotion: 0,
  motion: 0,
  mic: 0,
  listen: DEFAULT_LISTEN,
  bands: { rms: 0, bass: 0, mid: 0, high: 0, centroid: 0 },
  trackOn: false,
  stats: emptyStats(),
  started: false,
  paused: false,
  hasImage: false,
  seedNonce: 0,
  scatterNonce: 0,
  customPalette: null,
  lockCount: 0,
  morph: null,
  liveStops: null,
  waveform: DEFAULT_WAVEFORM,
  historyDepth: 0,
  keyId: DEFAULT_KEY,
  modeId: DEFAULT_MODE,
  pitchMinHz: DEFAULT_PITCH_MIN,
  pitchMaxHz: DEFAULT_PITCH_MAX,
  vibratoRate: DEFAULT_VIBRATO_RATE,
  vibratoDepth: DEFAULT_VIBRATO_DEPTH,
  orbitRate: DEFAULT_ORBIT_RATE,
  orbitN: 7,
  orbitRot: 0,
  orbitDegrees: [],
  orbitPeriod: 1,
  beat: 0,
  gyroOn: true,
  play: { amp: 0, pitch: 0.5, timbre: 0.12 },
};

export function resetRuntimeParams(partial: Partial<SimParams>) {
  Object.assign(runtime.params, partial);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function ease(t: number) {
  return t * t * (3 - 2 * t);
}

export function beginPresetMorph(
  to: { feed: number; kill: number; du: number; dv: number; stops: Palette["stops"] },
  dur = 0.9,
) {
  const cur =
    runtime.params.paletteId === "image" && runtime.customPalette
      ? runtime.customPalette
      : paletteById(runtime.params.paletteId);
  const fromStops = runtime.liveStops ?? cur.stops;
  runtime.morph = {
    fromFeed: runtime.params.feed,
    fromKill: runtime.params.kill,
    fromDu: runtime.params.du,
    fromDv: runtime.params.dv,
    fromStops,
    toFeed: to.feed,
    toKill: to.kill,
    toDu: to.du,
    toDv: to.dv,
    toStops: to.stops,
    t: 0,
    dur,
  };
}

export function tickMorph(dt: number) {
  const m = runtime.morph;
  if (!m) return;
  m.t = Math.min(1, m.t + dt / m.dur);
  const k = ease(m.t);
  runtime.params.feed = lerp(m.fromFeed, m.toFeed, k);
  runtime.params.kill = lerp(m.fromKill, m.toKill, k);
  runtime.params.du = lerp(m.fromDu, m.toDu, k);
  runtime.params.dv = lerp(m.fromDv, m.toDv, k);
  const stops = m.fromStops.map((s, i) => [
    lerp(s[0], m.toStops[i]![0], k),
    lerp(s[1], m.toStops[i]![1], k),
    lerp(s[2], m.toStops[i]![2], k),
  ]) as Palette["stops"];
  runtime.liveStops = stops;
  if (m.t >= 1) runtime.morph = null;
}
