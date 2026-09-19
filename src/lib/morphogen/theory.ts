/** Circle-of-fifths keys, church modes, and blues/sus packs. */

export type KeyId =
  | "C"
  | "G"
  | "D"
  | "A"
  | "E"
  | "B"
  | "F#"
  | "Db"
  | "Ab"
  | "Eb"
  | "Bb"
  | "F";

export type ModeId =
  | "ionian"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"
  | "locrian"
  | "major"
  | "minor"
  | "pentatonic-major"
  | "pentatonic-minor"
  | "blues-major"
  | "blues-minor"
  | "suspended";

export type KeyDef = {
  id: KeyId;
  name: string;
  alt?: string;
  /** Pitch class, C = 0. */
  pc: number;
  /** Steps from C on the circle of fifths (0..11). */
  fifths: number;
  relative: string;
};

export type ModeDef = {
  id: ModeId;
  name: string;
  roman: string;
  blurb: string;
  /** Semitone offsets from the tonic. */
  intervals: number[];
};

/** Clockwise from C, as the circle of fifths. Compass 0° = C. */
export const KEYS: KeyDef[] = [
  { id: "C", name: "C", pc: 0, fifths: 0, relative: "a" },
  { id: "G", name: "G", pc: 7, fifths: 1, relative: "e" },
  { id: "D", name: "D", pc: 2, fifths: 2, relative: "b" },
  { id: "A", name: "A", pc: 9, fifths: 3, relative: "f#" },
  { id: "E", name: "E", pc: 4, fifths: 4, relative: "c#" },
  { id: "B", name: "B", pc: 11, fifths: 5, relative: "g#" },
  { id: "F#", name: "F♯", alt: "G♭", pc: 6, fifths: 6, relative: "eb" },
  { id: "Db", name: "C♯", alt: "D♭", pc: 1, fifths: 7, relative: "bb" },
  { id: "Ab", name: "A♭", pc: 8, fifths: 8, relative: "f" },
  { id: "Eb", name: "E♭", pc: 3, fifths: 9, relative: "c" },
  { id: "Bb", name: "B♭", pc: 10, fifths: 10, relative: "g" },
  { id: "F", name: "F", pc: 5, fifths: 11, relative: "d" },
];

export const MODES: ModeDef[] = [
  { id: "ionian", name: "Ionian", roman: "I", blurb: "Major scale", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "major", name: "Major", roman: "M", blurb: "Same tones as Ionian", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "dorian", name: "Dorian", roman: "II", blurb: "Minor, raised 6", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: "phrygian", name: "Phrygian", roman: "III", blurb: "Minor, flat 2", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: "lydian", name: "Lydian", roman: "IV", blurb: "Major, raised 4", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: "mixolydian", name: "Mixolydian", roman: "V", blurb: "Major, flat 7", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: "aeolian", name: "Aeolian", roman: "VI", blurb: "Natural minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "minor", name: "Minor", roman: "m", blurb: "Same tones as Aeolian", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "locrian", name: "Locrian", roman: "VII", blurb: "Diminished 5", intervals: [0, 1, 3, 5, 6, 8, 10] },
  { id: "pentatonic-major", name: "Pentatonic maj", roman: "P+", blurb: "Major pentatonic", intervals: [0, 2, 4, 7, 9] },
  { id: "pentatonic-minor", name: "Pentatonic min", roman: "P−", blurb: "Minor pentatonic", intervals: [0, 3, 5, 7, 10] },
  { id: "blues-major", name: "Blues major", roman: "B♭M", blurb: "Major blues hexatonic", intervals: [0, 2, 3, 4, 7, 9] },
  { id: "blues-minor", name: "Blues minor", roman: "Bm", blurb: "Minor blues hexatonic", intervals: [0, 3, 5, 6, 7, 10] },
  { id: "suspended", name: "Suspended", roman: "sus", blurb: "No third — 2 and 4", intervals: [0, 2, 5, 7, 9] },
];

export const DEFAULT_KEY: KeyId = "C";
export const DEFAULT_MODE: ModeId = "ionian";

/** Earth-ionosphere cavity fundamental. The generating tone of The Hum. */
export const SCHUMANN = 7.83;

/** Audible Hum octaves of 7.83 Hz. ×32 / ×64 / ×128 sit in a phone speaker. */
export const HUM_X16 = SCHUMANN * 16; // 125.28
export const HUM_X32 = SCHUMANN * 32; // 250.56
export const HUM_X64 = SCHUMANN * 64; // 501.12
export const HUM_X128 = SCHUMANN * 128; // 1002.24
export const HUM_X256 = SCHUMANN * 256; // 2004.48

/**
 * Factory voice window: a high octave of The Hum (B3-ish through B5-ish).
 * Lo can open to the 7.83 Hz cavity; Hi to ×256.
 */
export const DEFAULT_PITCH_MIN = HUM_X32;
export const DEFAULT_PITCH_MAX = HUM_X128;
export const ABSOLUTE_PITCH_MIN = SCHUMANN;
export const ABSOLUTE_PITCH_MAX = HUM_X256;

export function keyById(id: string): KeyDef {
  return KEYS.find((k) => k.id === id) ?? KEYS[0]!;
}

export function modeById(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

/** Compass heading (0 = north) → circle-of-fifths key, with hysteresis. */
export function headingToKey(heading: number, current: KeyId): KeyId {
  const h = ((heading % 360) + 360) % 360;
  const idx = Math.round(h / 30) % 12;
  const cur = KEYS.findIndex((k) => k.id === current);
  if (cur < 0) return KEYS[idx]!.id;
  const curCenter = cur * 30;
  let dc = h - curCenter;
  if (dc > 180) dc -= 360;
  if (dc < -180) dc += 360;
  if (Math.abs(dc) < 18) return current;
  return KEYS[idx]!.id;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function formatHz(n: number): string {
  if (!Number.isFinite(n)) return "— Hz";
  if (n < 20) return `${n.toFixed(2)} Hz`;
  if (n < 100) return `${n.toFixed(1)} Hz`;
  return `${Math.round(n)} Hz`;
}

function scaleMidisInRange(tonicPc: number, intervals: number[], minHz: number, maxHz: number): number[] {
  const lo = Math.max(ABSOLUTE_PITCH_MIN, Math.min(minHz, maxHz));
  const hi = Math.max(lo + 1, Math.max(minHz, maxHz));
  const allowed = new Set(intervals.map((s) => ((s % 12) + 12) % 12));
  const notes: number[] = [];
  for (let midi = 0; midi <= 120; midi++) {
    const hz = midiToHz(midi);
    if (hz < lo - 0.8) continue;
    if (hz > hi + 0.8) break;
    const rel = (((midi % 12) + 12) % 12 - ((tonicPc % 12) + 12) % 12 + 12) % 12;
    if (allowed.has(rel)) notes.push(midi);
  }
  return notes;
}

/**
 * Map vertical position (0 = top of glass = high) onto the current scale,
 * clamped to the chosen frequency window.
 */
export function yToScaleHz(
  y: number,
  pitchTilt: number,
  tonicPc: number,
  intervals: number[],
  snap = 0.88,
  minHz = DEFAULT_PITCH_MIN,
  maxHz = DEFAULT_PITCH_MAX,
): number {
  const lo = Math.max(ABSOLUTE_PITCH_MIN, Math.min(minHz, maxHz));
  const hi = Math.max(lo + 1, Math.max(minHz, maxHz));
  const ny = Math.max(0, Math.min(1, 1 - y + pitchTilt * 0.42));
  const notes = scaleMidisInRange(tonicPc, intervals, lo, hi);
  let hz: number;
  if (notes.length === 0) {
    hz = lo * Math.pow(hi / lo, ny);
  } else {
    const span = notes.length - 1;
    const raw = ny * span;
    const i0 = Math.max(0, Math.min(span, Math.round(raw)));
    const snapped = midiToHz(notes[i0]!);
    const a = Math.max(0, Math.min(span, Math.floor(raw)));
    const b = Math.min(span, a + 1);
    const frac = raw - a;
    const continuous = midiToHz(notes[a]!) * (1 - frac) + midiToHz(notes[b]!) * frac;
    hz = continuous * (1 - snap) + snapped * snap;
  }
  if (!Number.isFinite(hz)) return HUM_X64;
  return Math.max(lo, Math.min(hi, hz));
}

export function tonicHz(tonicPc: number, minHz = DEFAULT_PITCH_MIN, maxHz = DEFAULT_PITCH_MAX): number {
  const lo = Math.max(ABSOLUTE_PITCH_MIN, Math.min(minHz, maxHz));
  const hi = Math.max(lo + 1, Math.max(minHz, maxHz));
  const mid = Math.sqrt(lo * hi);
  let best = 72;
  let bestDist = Infinity;
  for (let oct = -1; oct <= 9; oct++) {
    const midi = 12 + oct * 12 + (((tonicPc % 12) + 12) % 12);
    const hz = midiToHz(midi);
    if (hz < lo * 0.92 || hz > hi * 1.08) continue;
    const dist = Math.abs(Math.log(hz / mid));
    if (dist < bestDist) {
      bestDist = dist;
      best = midi;
    }
  }
  const hz = midiToHz(best);
  return Number.isFinite(hz) ? hz : HUM_X64;
}

/** Tonic, third-or-fourth, and fifth (or tritone) of a mode, in semitones. */
export function modeChordOffsets(intervals: number[]): [number, number, number] {
  const set = new Set(intervals.map((s) => ((s % 12) + 12) % 12));
  const third = set.has(4) ? 4 : set.has(3) ? 3 : set.has(5) ? 5 : set.has(2) ? 2 : 4;
  const fifth = set.has(7) ? 7 : set.has(6) ? 6 : set.has(8) ? 8 : 7;
  return [0, third, fifth];
}

export function formatKeyMode(keyId: string, modeId: string): string {
  const k = keyById(keyId);
  const m = modeById(modeId);
  return `${k.name}${k.alt ? "/" + k.alt : ""} ${m.name}`;
}

export function clampPitchRange(minHz: number, maxHz: number): { min: number; max: number } {
  const lo = Math.max(ABSOLUTE_PITCH_MIN, Math.min(minHz, maxHz - 8));
  const hi = Math.min(ABSOLUTE_PITCH_MAX, Math.max(maxHz, lo + 8));
  return { min: lo, max: hi };
}

/** True when a stored window is the old inaudible factory (47–376 Hz). */
export function isLegacyPitchWindow(minHz: number, maxHz: number): boolean {
  return Math.abs(minHz - 47) < 1.5 && Math.abs(maxHz - 376) < 2;
}