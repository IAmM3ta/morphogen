/** Scale helpers for the v2 voices. Key/mode come from the existing instrument. */
import { runtime } from "@/lib/morphogen/runtime";
import { keyById, modeById, midiToHz } from "@/lib/morphogen/theory";

export function currentScale(): { pc: number; intervals: number[] } {
  const key = keyById(runtime.keyId);
  const mode = modeById(runtime.modeId);
  return { pc: key.pc, intervals: mode.intervals.length ? mode.intervals : [0, 2, 4, 5, 7, 9, 11] };
}

/** All scale MIDI notes in [lo, hi]. */
export function scaleNotes(lo: number, hi: number): number[] {
  const { pc, intervals } = currentScale();
  const allowed = new Set(intervals.map((s) => ((s % 12) + 12) % 12));
  const out: number[] = [];
  for (let m = Math.ceil(lo); m <= hi; m++) {
    const rel = (((m - pc) % 12) + 12) % 12;
    if (allowed.has(rel)) out.push(m);
  }
  return out;
}

/**
 * Map a 0–1 position onto a MIDI pitch in [lo, hi].
 * quantize = 1 snaps fully to the scale; 0 is a free (continuous) theremin.
 */
export function positionToMidi(pos: number, lo: number, hi: number, quantize: number): number {
  const p = Math.max(0, Math.min(1, pos));
  const free = lo + (hi - lo) * p;
  if (quantize <= 0) return free;
  const notes = scaleNotes(lo, hi);
  if (!notes.length) return free;
  const raw = p * (notes.length - 1);
  const snapped = notes[Math.round(raw)]!;
  return free * (1 - quantize) + snapped * quantize;
}

/** Scale degree (can be negative / beyond one octave) → MIDI, relative to a root octave. */
export function degreeToMidi(degree: number, rootMidi: number): number {
  const { intervals } = currentScale();
  const n = intervals.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return rootMidi + oct * 12 + intervals[idx]!;
}

/** Key root placed in a register window starting at `low` (inclusive, 12 semitones). */
export function rootIn(low: number): number {
  const { pc } = currentScale();
  let r = low - (((low % 12) + 12) % 12) + pc;
  if (r < low) r += 12;
  return r;
}

export function hz(midi: number): number {
  return midiToHz(midi);
}

export function midiFromHz(f: number): number {
  return 69 + 12 * Math.log2(Math.max(1e-3, f) / 440);
}
