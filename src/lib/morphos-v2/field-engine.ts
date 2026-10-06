/**
 * The surface MorphogenApp uses from a field engine. The WebGL2 RDEngine
 * (fallback) and the WebGPU RDGpuEngine (primary, v2) both satisfy it.
 */
import type { FieldStats, Palette } from "@/lib/morphogen/presets";

export interface FieldEngine {
  readonly canvas: HTMLCanvasElement;
  simW: number;
  simH: number;
  lockCount: number;
  flash: number;
  onFrame: ((dt: number, stats: FieldStats) => void) | null;
  start(): void;
  stop(): void;
  destroy(): void;
  setImage(source: TexImageSource | null): void;
  seed(force?: boolean): void;
  currentPalette(): Palette;
  lockLayer(x?: number, y?: number): number;
  popLock(): number;
  clearLocks(): void;
  checkpoint(): void;
  undo(): boolean;
  clearFieldHistory(): void;
  capturePng(): Promise<Blob>;
}

/** WebGPU is tried unless absent or disabled with ?gpu=0 (or forced off by a previous failure this session). */
export function wantWebGPU(): boolean {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("gpu") === "0" || q.get("renderer") === "webgl") return false;
    if (sessionStorage.getItem("morphos-v2-gpu-failed") === "1" && q.get("gpu") !== "1") return false;
  } catch {
    /* storage may be blocked */
  }
  return true;
}

export function markWebGPUFailed() {
  try {
    sessionStorage.setItem("morphos-v2-gpu-failed", "1");
  } catch {
    /* ignore */
  }
}
