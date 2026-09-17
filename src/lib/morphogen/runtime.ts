import {
  DEFAULT_PARAMS,
  emptyStats,
  type Brush,
  type FieldStats,
  type Palette,
  type SimParams,
} from "./presets";

export type Runtime = {
  params: SimParams;
  brushes: Brush[];
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
