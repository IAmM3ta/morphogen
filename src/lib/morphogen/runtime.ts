import {
  DEFAULT_PARAMS,
  emptyStats,
  type Brush,
  type FieldStats,
  type Palette,
  type SimParams,
} from "./presets";

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
  stats: FieldStats;
  started: boolean;
  paused: boolean;
  hasImage: boolean;
  seedNonce: number;
  scatterNonce: number;
  customPalette: Palette | null;
  lockCount: number;
};

export const runtime: Runtime = {
  params: { ...DEFAULT_PARAMS },
  brushes: [],
  antenna: { x: 0.5, y: 0.5, on: false, pressure: 0 },
  sense: { roll: 0, pitch: 0, yaw: 0, spin: 0, gforce: 0, heading: 0, pressure: 0 },
  flowX: 0,
  flowY: 0,
  pointerFlowX: 0,
  pointerFlowY: 0,
  pointerMotion: 0,
  motion: 0,
  mic: 0,
  stats: emptyStats(),
  started: false,
  paused: false,
  hasImage: false,
  seedNonce: 0,
  scatterNonce: 0,
  customPalette: null,
  lockCount: 0,
};

export function resetRuntimeParams(partial: Partial<SimParams>) {
  Object.assign(runtime.params, partial);
}
