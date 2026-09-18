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
  { id: "Db", name: "D♭", alt: "C♯", pc: 1, fifths: 7, relative: "bb" },
  { id: "Ab", name: "A♭", pc: 8, fifths: 8, relative: "f" },
  { id: "Eb", name: "E♭", pc: 3, fifths: 9, relative: "c" },
  { id: "Bb", name: "B♭", pc: 10, fifths: 10, relative: "g" },
  { id: "F", name: "F", pc: 5, fifths: 11, relative: "d" },
];

export const MODES: ModeDef[] = [
  { id: "ionian", name: "Ionian", roman: "I", blurb: "Major scale", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "dorian", name: "Dorian", roman: "II", blurb: "Minor, raised 6", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: "phrygian", name: "Phrygian", roman: "III", blurb: "Minor, flat 2", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: "lydian", name: "Lydian", roman: "IV", blurb: "Major, raised 4", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: "mixolydian", name: "Mixolydian", roman: "V", blurb: "Major, flat 7", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: "aeolian", name: "Aeolian", roman: "VI", blurb: "Natural minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "locrian", name: "Locrian", roman: "VII", blurb: "Diminished 5", intervals: [0, 1, 3, 5, 6, 8, 10] },
  { id: "major", name: "Major", roman: "M", blurb: "Ionian triad color", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "minor", name: "Minor", roman: "m", blurb: "Aeolian triad color", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "blues-major", name: "Blues major", roman: "B♭M", blurb: "Major blues hexatonic", intervals: [0, 2, 3, 4, 7, 9] },
  { id: "blues-minor", name: "Blues minor", roman: "Bm", blurb: "Minor blues hexatonic", intervals: [0, 3, 5, 6, 7, 10] },
  { id: "suspended", name: "Suspended", roman: "sus", blurb: "No third — 2 and 4", intervals: [0, 2, 5, 7, 9] },
];

export const DEFAULT_KEY: KeyId = "C";
export const DEFAULT_MODE: ModeId = "ionian";

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

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function degreeToMidi(degreeIndex: number, tonicPc: number, intervals: number[]): number {
  const n = Math.max(1, intervals.length);
  const oct = Math.floor(degreeIndex / n);
  let deg = degreeIndex % n;
  if (deg < 0) deg += n;
  const pc = (tonicPc + intervals[deg]!) % 12;
  return 48 + pc + oct * 12;
}

/**
 * Map vertical position (0 = top of glass = high) onto the current scale.
 * Spans three octaves of the mode, starting near C3 of the tonic.
 */
export function yToScaleHz(
  y: number,
  pitchTilt: number,
  tonicPc: number,
  intervals: number[],
  snap = 0.88,
): number {
  const ny = Math.max(0, Math.min(1, 1 - y + pitchTilt * 0.42));
  const n = Math.max(1, intervals.length);
  const span = n * 3 - 1;
  const raw = ny * span;
  const i0 = Math.max(0, Math.min(span, Math.round(raw)));
  const snapped = midiToHz(degreeToMidi(i0, tonicPc, intervals));
  const continuous = midiToHz(degreeToMidi(raw, tonicPc, intervals));
  return continuous * (1 - snap) + snapped * snap;
}

export function formatKeyMode(keyId: string, modeId: string): string {
  const k = keyById(keyId);
  const m = modeById(modeId);
  return `${k.name} ${m.name}`;
}
