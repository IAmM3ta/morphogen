/**
 * Shared audio-features bus. Sound writes, visuals read. One mutable object,
 * no allocation per frame, safe to read from any render loop.
 */
import { approach, clamp01, follow } from "./smoothing";

export const SPECTRUM_BANDS = 32;
export const MAX_RIPPLES = 8;

/** `seed`: whether the WebGPU field plants growth here (touch alone never does — M-06). */
export type Ripple = { x: number; y: number; t: number; strength: number; hue: number; seed: boolean };

export type AudioFeatures = {
  /** Seconds, monotonic (performance clock). */
  now: number;
  /** True while a running AudioContext feeds the analyser. */
  live: boolean;
  rms: number;
  peak: number;
  sub: number;
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  air: number;
  /** Spectral centroid, log-normalised 0 (dark) … 1 (bright). */
  centroid: number;
  flux: number;
  /** Detected onset, 0–1, decays. */
  onset: number;
  /** Transport beat pulse 0–1 (kick-synchronous when the loop plays). */
  beat: number;
  beatPhase: number;
  bar: number;
  step: number;
  playing: boolean;
  bpm: number;
  drone: { hz: number; norm: number; level: number; bright: number; spread: number };
  bassVoice: { env: number; hz: number; cutoff: number };
  kick: number;
  hat: number;
  clap: number;
  perc: number;
  spectrum: Float32Array;
  sensors: { tiltX: number; tiltY: number; heading: number; shake: number; active: boolean };
  touch: { x: number; y: number; down: boolean; count: number };
  ripples: Ripple[];
  rippleHead: number;
};

export const features: AudioFeatures = {
  now: 0,
  live: false,
  rms: 0,
  peak: 0,
  sub: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  high: 0,
  air: 0,
  centroid: 0.35,
  flux: 0,
  onset: 0,
  beat: 0,
  beatPhase: 0,
  bar: 0,
  step: 0,
  playing: false,
  bpm: 120,
  drone: { hz: 110, norm: 0.4, level: 0, bright: 0.4, spread: 0.2 },
  bassVoice: { env: 0, hz: 55, cutoff: 0.3 },
  kick: 0,
  hat: 0,
  clap: 0,
  perc: 0,
  spectrum: new Float32Array(SPECTRUM_BANDS),
  sensors: { tiltX: 0, tiltY: 0, heading: 0, shake: 0, active: false },
  touch: { x: 0.5, y: 0.5, down: false, count: 0 },
  ripples: Array.from({ length: MAX_RIPPLES }, () => ({ x: 0.5, y: 0.5, t: -100, strength: 0, hue: 0, seed: false })),
  rippleHead: 0,
};

/** Drop a ripple (onset, kick, shake, touch-down) at glass coords 0–1. */
export function pushRipple(x: number, y: number, strength: number, hue = features.centroid, seed = true) {
  const r = features.ripples[features.rippleHead % MAX_RIPPLES]!;
  r.x = x;
  r.y = y;
  r.t = features.now;
  r.strength = clamp01(strength);
  r.hue = hue;
  r.seed = seed;
  features.rippleHead = (features.rippleHead + 1) % MAX_RIPPLES;
}

/** Discrete voice hits, written by the scheduler at their audio time. */
export function noteHit(kind: "kick" | "hat" | "clap" | "perc", velocity: number) {
  features[kind] = Math.max(features[kind], clamp01(velocity));
  if (kind === "kick") features.beat = Math.max(features.beat, clamp01(velocity));
}

type Edges = { lo: number; hi: number };
const BAND_EDGES: Record<"sub" | "bass" | "lowMid" | "mid" | "high" | "air", Edges> = {
  sub: { lo: 20, hi: 60 },
  bass: { lo: 60, hi: 250 },
  lowMid: { lo: 250, hi: 500 },
  mid: { lo: 500, hi: 2000 },
  high: { lo: 2000, hi: 6000 },
  air: { lo: 6000, hi: 16000 },
};

/**
 * Reads an AnalyserNode (post-limiter tap) into `features`.
 * Bands are auto-gained against a slow running peak so quiet drones still
 * move the picture, with a floor so silence stays still.
 */
export class FeatureAnalyser {
  private freq: Float32Array<ArrayBuffer>;
  private time: Float32Array<ArrayBuffer>;
  private prevMag: Float32Array;
  private mag: Float32Array;
  private peaks: Record<string, number> = {};
  private fluxHist: number[] = [];
  private bandIndex: { lo: number; hi: number }[] = [];
  private specIndex: { lo: number; hi: number }[] = [];
  private lastOnsetAt = 0;

  constructor(private analyser: AnalyserNode) {
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -20;
    const n = analyser.frequencyBinCount;
    this.freq = new Float32Array(new ArrayBuffer(n * 4));
    this.time = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    this.prevMag = new Float32Array(n);
    this.mag = new Float32Array(n);
    const sr = analyser.context.sampleRate;
    const hzToBin = (hz: number) => Math.max(1, Math.min(n - 1, Math.round((hz / (sr / 2)) * n)));
    for (const k of Object.keys(BAND_EDGES) as (keyof typeof BAND_EDGES)[]) {
      const e = BAND_EDGES[k];
      this.bandIndex.push({ lo: hzToBin(e.lo), hi: Math.max(hzToBin(e.lo) + 1, hzToBin(e.hi)) });
    }
    // Log-spaced display bands 40 Hz … 16 kHz.
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const lo = 40 * Math.pow(16000 / 40, i / SPECTRUM_BANDS);
      const hi = 40 * Math.pow(16000 / 40, (i + 1) / SPECTRUM_BANDS);
      const a = hzToBin(lo);
      this.specIndex.push({ lo: a, hi: Math.max(a + 1, hzToBin(hi)) });
    }
  }

  update(dt: number) {
    const a = this.analyser;
    a.getFloatFrequencyData(this.freq);
    a.getFloatTimeDomainData(this.time);
    const n = this.freq.length;
    let flux = 0;
    let wSum = 0;
    let mSum = 0;
    const sr = a.context.sampleRate;
    for (let i = 1; i < n; i++) {
      const db = this.freq[i]!;
      const m = Number.isFinite(db) ? clamp01((db + 100) / 80) : 0;
      this.mag[i] = m;
      const d = m - this.prevMag[i]!;
      if (d > 0 && i < n * 0.5) flux += d;
      this.prevMag[i] = m;
      const hz = (i / n) * (sr / 2);
      if (hz > 60 && hz < 12000) {
        wSum += Math.log2(hz) * m * m;
        mSum += m * m;
      }
    }
    let sq = 0;
    let pk = 0;
    for (let i = 0; i < this.time.length; i++) {
      const s = this.time[i]!;
      sq += s * s;
      const ab = Math.abs(s);
      if (ab > pk) pk = ab;
    }
    const rms = Math.sqrt(sq / this.time.length);
    const f = features;
    f.rms = follow(f.rms, clamp01(rms * 3.2), dt, 0.02, 0.18);
    f.peak = follow(f.peak, clamp01(pk), dt, 0.005, 0.3);

    const keys = Object.keys(BAND_EDGES) as (keyof typeof BAND_EDGES)[];
    keys.forEach((k, bi) => {
      const { lo, hi } = this.bandIndex[bi]!;
      let s = 0;
      for (let i = lo; i < hi; i++) s += this.mag[i]!;
      const raw = s / Math.max(1, hi - lo);
      const pkKey = `b${bi}`;
      const prevPeak = this.peaks[pkKey] ?? 0.3;
      const peak = Math.max(raw, prevPeak * Math.exp(-dt / 6));
      this.peaks[pkKey] = peak;
      const norm = clamp01(raw / Math.max(0.35, peak));
      // Gate near silence so the picture rests when nothing sounds.
      const gated = raw < 0.08 ? norm * (raw / 0.08) : norm;
      f[k] = follow(f[k], gated, dt, 0.015, 0.12);
    });
    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      const { lo, hi } = this.specIndex[b]!;
      let s = 0;
      for (let i = lo; i < hi; i++) s += this.mag[i]!;
      const v = s / Math.max(1, hi - lo);
      f.spectrum[b] = follow(f.spectrum[b]!, v, dt, 0.02, 0.2);
    }
    const centroid = mSum > 1e-4 ? clamp01((wSum / mSum - Math.log2(100)) / (Math.log2(8000) - Math.log2(100))) : 0.35;
    f.centroid = approach(f.centroid, centroid, dt, 0.12);

    // Adaptive-threshold onset on positive spectral flux.
    this.fluxHist.push(flux);
    if (this.fluxHist.length > 43) this.fluxHist.shift();
    const mean = this.fluxHist.reduce((s, v) => s + v, 0) / this.fluxHist.length;
    const sd = Math.sqrt(this.fluxHist.reduce((s, v) => s + (v - mean) * (v - mean), 0) / this.fluxHist.length);
    f.flux = clamp01(flux / 40);
    const nowMs = performance.now();
    if (flux > mean + sd * 1.6 + 1.2 && nowMs - this.lastOnsetAt > 90 && rms > 0.01) {
      this.lastOnsetAt = nowMs;
      f.onset = 1;
      const tx = f.touch.down ? f.touch.x : 0.5 + (Math.random() - 0.5) * 0.5;
      const ty = f.touch.down ? f.touch.y : 0.5 + (Math.random() - 0.5) * 0.5;
      // Under a finger the onset only ripples; elsewhere it plants growth.
      pushRipple(tx, ty, clamp01(0.4 + (flux - mean) / 30), f.centroid, !f.touch.down);
    }
    f.live = true;
  }
}

/**
 * Decay one-shot features each frame. Also synthesises a gentle "ghost"
 * signal when no audio is live (wallpaper mode without sound), so visuals
 * still breathe.
 */
let ghostAt = 0;

export function tickFeatures(dt: number, nowSec: number) {
  const f = features;
  f.now = nowSec;
  f.onset *= Math.exp(-dt * 7);
  f.beat *= Math.exp(-dt * 6);
  f.kick *= Math.exp(-dt * 9);
  f.hat *= Math.exp(-dt * 16);
  f.clap *= Math.exp(-dt * 10);
  f.perc *= Math.exp(-dt * 10);
  if (!f.live) {
    const t = nowSec;
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.21);
    f.rms = approach(f.rms, 0.12 + 0.1 * breathe, dt, 0.5);
    f.bass = approach(f.bass, 0.25 + 0.25 * Math.sin(t * 0.33) ** 2, dt, 0.5);
    f.sub = f.bass * 0.8;
    f.mid = approach(f.mid, 0.2 + 0.15 * Math.sin(t * 0.17 + 1), dt, 0.5);
    f.high = approach(f.high, 0.12 + 0.1 * Math.sin(t * 0.41 + 2), dt, 0.5);
    f.centroid = approach(f.centroid, 0.35 + 0.2 * Math.sin(t * 0.05), dt, 1);
    f.drone.norm = approach(f.drone.norm, 0.4 + 0.3 * Math.sin(t * 0.031), dt, 2);
    f.drone.level = approach(f.drone.level, 0.3, dt, 2);
    for (let b = 0; b < SPECTRUM_BANDS; b++) {
      f.spectrum[b] = approach(f.spectrum[b]!, 0.15 + 0.12 * Math.sin(t * 0.3 + b * 0.4), dt, 0.6);
    }
    // A slow ghost pulse so a silent wallpaper still blooms now and then.
    if (t - ghostAt > 7 + Math.random() * 5) {
      ghostAt = t;
      pushRipple(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 0.45);
    }
  }
}
