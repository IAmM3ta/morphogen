import type { SimParams } from "./presets";
import type { WaveformId } from "./presets";
import { runtime } from "./runtime";

export type UndoSnap = {
  params: SimParams;
  presetId: string;
  waveform: WaveformId;
  lockCount: number;
};

type HistorySink = {
  capture: () => UndoSnap;
  checkpointField: () => void;
  restoreField: () => boolean;
};

const MAX = 8;
const stack: UndoSnap[] = [];
const listeners = new Set<(n: number) => void>();

let sink: HistorySink | null = null;
let coalescing = false;
let restoring = false;

function emit() {
  runtime.historyDepth = stack.length;
  for (const fn of listeners) fn(stack.length);
}

export function bindHistory(next: HistorySink | null) {
  sink = next;
}

export function subscribeHistory(fn: (n: number) => void) {
  listeners.add(fn);
  fn(stack.length);
  return () => {
    listeners.delete(fn);
  };
}

export function isRestoring() {
  return restoring;
}

export function historyDepth() {
  return stack.length;
}

export function beginGesture() {
  if (restoring) return;
  if (!coalescing) {
    checkpoint();
    coalescing = true;
  }
}

export function endGesture() {
  coalescing = false;
}

export function maybeCheckpoint() {
  if (restoring || coalescing) return;
  checkpoint();
}

export function checkpoint() {
  if (restoring || !sink) return;
  stack.push(sink.capture());
  if (stack.length > MAX) stack.shift();
  sink.checkpointField();
  emit();
}

export function undo(): UndoSnap | null {
  const snap = stack.pop();
  if (!snap) return null;
  restoring = true;
  sink?.restoreField();
  emit();
  return snap;
}

export function finishUndo() {
  restoring = false;
}

export function clearHistory() {
  stack.length = 0;
  coalescing = false;
  restoring = false;
  emit();
}