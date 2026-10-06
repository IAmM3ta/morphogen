/**
 * Shared look/driver state for the field engines. The UI writes it; the
 * WebGPU engine reads it every frame; the WebGL2 fallback reads the palette
 * override through `runtime.v2Stops`.
 */
import type { VisualId } from "../visuals/presets";

export type QualityPref = "auto" | "low" | "high";

export const look = {
  visual: "off" as VisualId,
  reducedMotion: false,
  quality: "auto" as QualityPref,
  /** 0 = uncapped. Wallpaper mode may set 30. */
  maxFps: 0,
  /** Device-pixel-ratio cap for the output and sim grid (wallpaper may lower it). */
  maxDpr: 3,
  /** Pattern scale multiplier (diffusion), 0.6–1.6. */
  scale: 1,
  /** How strongly sound drives the chemistry, 0–1.5. */
  reactivity: 1,
  /** Drift the second regime through spots → stripes → labyrinth … */
  morph: true,
  /** Bumped whenever the palette must be rebuilt. */
  rev: 1,
};

export function setLook(p: Partial<Omit<typeof look, "rev">>) {
  Object.assign(look, p);
  look.rev++;
}

/** Live readout for the UI (renderer badge, regime name, sim size, steps). */
export const lookStatus = {
  renderer: "pending" as "pending" | "webgpu" | "webgl2",
  regime: "",
  simW: 0,
  simH: 0,
  steps: 0,
  fps: 0,
  reason: "",
};
