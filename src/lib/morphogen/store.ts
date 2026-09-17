import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_PARAMS,
  DEFAULT_PRESET,
  DEFAULT_WAVEFORM,
  paletteById,
  presetById,
  type ImageMode,
  type SimParams,
  type WaveformId,
} from "./presets";
import { isRestoring, maybeCheckpoint } from "./history";
import { beginPresetMorph, resetRuntimeParams, runtime } from "./runtime";
import type { UndoSnap } from "./history";

export type ImageSlot = {
  id: string;
  name: string;
  url: string;
};

export type InstrumentState = {
  started: boolean;
  uiHidden: boolean;
  panelOpen: boolean;
  presetId: string;
  params: SimParams;
  waveform: WaveformId;
  gyroOn: boolean;
  micOn: boolean;
  cameraOn: boolean;
  audioOn: boolean;
  volume: number;
  muted: boolean;
  tdUrl: string;
  tdGrid: boolean;
  midiOn: boolean;
  midiId: string | null;
  roomCode: string;
  role: "solo" | "stage";
  images: ImageSlot[];
  activeImageId: string | null;
  applyPreset: (id: string) => void;
  restoreDefaults: () => void;
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  setWaveform: (id: WaveformId) => void;
  setImageMode: (mode: ImageMode) => void;
  applySnapshot: (snap: UndoSnap) => void;
  patch: (partial: Partial<InstrumentState>) => void;
};

function pushParams(params: SimParams) {
  resetRuntimeParams(params);
}

export const useInstrument = create<InstrumentState>()(
  persist(
    (set, get) => ({
      started: false,
      uiHidden: false,
      panelOpen: false,
      presetId: DEFAULT_PRESET.id,
      params: { ...DEFAULT_PARAMS },
      waveform: DEFAULT_WAVEFORM,
      gyroOn: true,
      micOn: false,
      cameraOn: false,
      audioOn: true,
      volume: 0.7,
      muted: false,
      tdUrl: "ws://127.0.0.1:9980",
      tdGrid: true,
      midiOn: false,
      midiId: null,
      roomCode: "",
      role: "solo",
      images: [],
      activeImageId: null,
      applyPreset: (id) => {
        if (get().presetId === id && !isRestoring()) return;
        maybeCheckpoint();
        const preset = presetById(id);
        const pal = paletteById(preset.paletteId);
        beginPresetMorph({
          feed: preset.feed,
          kill: preset.kill,
          du: preset.du,
          dv: preset.dv,
          stops: pal.stops,
        });
        const params: SimParams = {
          ...get().params,
          feed: preset.feed,
          kill: preset.kill,
          du: preset.du,
          dv: preset.dv,
          paletteId: preset.paletteId,
        };
        set({ presetId: id, params });
      },
      restoreDefaults: () => {
        maybeCheckpoint();
        const params = { ...DEFAULT_PARAMS };
        resetRuntimeParams(params);
        runtime.morph = null;
        runtime.liveStops = paletteById(DEFAULT_PRESET.paletteId).stops;
        runtime.waveform = DEFAULT_WAVEFORM;
        runtime.seedNonce += 1;
        set({ params, presetId: DEFAULT_PRESET.id, waveform: DEFAULT_WAVEFORM });
      },
      setParam: (key, value) => {
        maybeCheckpoint();
        const params = { ...get().params, [key]: value };
        pushParams(params);
        set({ params, presetId: key === "feed" || key === "kill" ? "custom" : get().presetId });
      },
      setWaveform: (id) => {
        if (get().waveform === id && !isRestoring()) return;
        maybeCheckpoint();
        runtime.waveform = id;
        set({ waveform: id });
      },
      setImageMode: (mode) => {
        maybeCheckpoint();
        const params = { ...get().params, imageMode: mode };
        pushParams(params);
        set({ params });
      },
      applySnapshot: (snap) => {
        resetRuntimeParams(snap.params);
        runtime.morph = null;
        runtime.waveform = snap.waveform;
        runtime.liveStops =
          snap.params.paletteId === "image" && runtime.customPalette
            ? runtime.customPalette.stops
            : paletteById(snap.params.paletteId).stops;
        set({
          params: { ...snap.params },
          presetId: snap.presetId,
          waveform: snap.waveform,
        });
      },
      patch: (partial) => set(partial),
    }),
    {
      name: "morphogen-v8",
      partialize: (s) => ({
        params: s.params,
        presetId: s.presetId,
        waveform: s.waveform,
        volume: s.volume,
        tdUrl: s.tdUrl,
        tdGrid: s.tdGrid,
        gyroOn: s.gyroOn,
        audioOn: s.audioOn,
      }),
    },
  ),
);

export function ensureRoomCode(): string {
  const existing = useInstrument.getState().roomCode;
  if (existing) return existing;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  useInstrument.setState({ roomCode: code, role: "stage" });
  return code;
}