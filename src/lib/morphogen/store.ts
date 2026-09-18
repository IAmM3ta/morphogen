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
import { DEFAULT_KEY, DEFAULT_MODE, type KeyId, type ModeId } from "./theory";

export type ImageSlot = {
  id: string;
  name: string;
  url: string;
};

export type FieldPatch = {
  id: string;
  name: string;
  savedAt: number;
  presetId: string;
  params: SimParams;
};

export type InstrumentState = {
  started: boolean;
  uiHidden: boolean;
  panelOpen: boolean;
  presetId: string;
  params: SimParams;
  waveform: WaveformId;
  keyId: KeyId;
  modeId: ModeId;
  compassKey: boolean;
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
  patches: FieldPatch[];
  applyPreset: (id: string) => void;
  restoreDefaults: () => void;
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  setWaveform: (id: WaveformId) => void;
  setKey: (id: KeyId, fromCompass?: boolean) => void;
  setMode: (id: ModeId) => void;
  setCompassKey: (on: boolean) => void;
  savePatch: (name?: string) => FieldPatch;
  loadPatch: (id: string) => void;
  deletePatch: (id: string) => void;
  setImageMode: (mode: ImageMode) => void;
  applySnapshot: (snap: UndoSnap) => void;
  patch: (partial: Partial<InstrumentState>) => void;
};

const MAX_PATCHES = 12;

function pushParams(params: SimParams) {
  resetRuntimeParams(params);
}

const CHEM_KEYS = new Set<keyof SimParams>(["feed", "kill", "du", "dv"]);

export const useInstrument = create<InstrumentState>()(
  persist(
    (set, get) => ({
      started: false,
      uiHidden: false,
      panelOpen: false,
      presetId: DEFAULT_PRESET.id,
      params: { ...DEFAULT_PARAMS },
      waveform: DEFAULT_WAVEFORM,
      keyId: DEFAULT_KEY,
      modeId: DEFAULT_MODE,
      compassKey: true,
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
      patches: [],
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
        runtime.keyId = DEFAULT_KEY;
        runtime.modeId = DEFAULT_MODE;
        set({
          params,
          presetId: DEFAULT_PRESET.id,
          waveform: DEFAULT_WAVEFORM,
          keyId: DEFAULT_KEY,
          modeId: DEFAULT_MODE,
          compassKey: true,
        });
      },
      setParam: (key, value) => {
        maybeCheckpoint();
        const params = { ...get().params, [key]: value };
        pushParams(params);
        if (CHEM_KEYS.has(key)) runtime.morph = null;
        set({ params, presetId: CHEM_KEYS.has(key) ? "custom" : get().presetId });
      },
      setWaveform: (id) => {
        if (get().waveform === id && !isRestoring()) return;
        maybeCheckpoint();
        runtime.waveform = id;
        set({ waveform: id });
      },
      setKey: (id, fromCompass = false) => {
        if (get().keyId === id) return;
        if (!fromCompass) maybeCheckpoint();
        runtime.keyId = id;
        set(fromCompass ? { keyId: id } : { keyId: id, compassKey: false });
      },
      setMode: (id) => {
        if (get().modeId === id && !isRestoring()) return;
        maybeCheckpoint();
        runtime.modeId = id;
        set({ modeId: id });
      },
      setCompassKey: (on) => set({ compassKey: on }),
      savePatch: (name) => {
        const s = get();
        const base = s.presetId === "custom" ? "Custom" : presetById(s.presetId).name;
        const n = s.patches.filter((p) => p.name.startsWith(base)).length + 1;
        const patch: FieldPatch = {
          id: `p${Date.now().toString(36)}`,
          name: name?.trim() || `${base} ${n}`,
          savedAt: Date.now(),
          presetId: s.presetId,
          params: { ...s.params },
        };
        const patches = [patch, ...s.patches].slice(0, MAX_PATCHES);
        set({ patches });
        return patch;
      },
      loadPatch: (id) => {
        const found = get().patches.find((p) => p.id === id);
        if (!found) return;
        maybeCheckpoint();
        const pal = paletteById(found.params.paletteId);
        beginPresetMorph({
          feed: found.params.feed,
          kill: found.params.kill,
          du: found.params.du,
          dv: found.params.dv,
          stops: pal.stops,
        });
        resetRuntimeParams(found.params);
        set({ params: { ...found.params }, presetId: found.presetId });
      },
      deletePatch: (id) => set({ patches: get().patches.filter((p) => p.id !== id) }),
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
        runtime.keyId = (snap.keyId as KeyId) || DEFAULT_KEY;
        runtime.modeId = (snap.modeId as ModeId) || DEFAULT_MODE;
        runtime.liveStops =
          snap.params.paletteId === "image" && runtime.customPalette
            ? runtime.customPalette.stops
            : paletteById(snap.params.paletteId).stops;
        set({
          params: { ...snap.params },
          presetId: snap.presetId,
          waveform: snap.waveform,
          keyId: (snap.keyId as KeyId) || DEFAULT_KEY,
          modeId: (snap.modeId as ModeId) || DEFAULT_MODE,
        });
      },
      patch: (partial) => set(partial),
    }),
    {
      name: "morphogen-v11",
      partialize: (s) => ({
        params: s.params,
        presetId: s.presetId,
        waveform: s.waveform,
        keyId: s.keyId,
        modeId: s.modeId,
        compassKey: s.compassKey,
        volume: s.volume,
        tdUrl: s.tdUrl,
        tdGrid: s.tdGrid,
        gyroOn: s.gyroOn,
        audioOn: s.audioOn,
        patches: s.patches,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        resetRuntimeParams(state.params);
        runtime.waveform = state.waveform;
        runtime.keyId = state.keyId;
        runtime.modeId = state.modeId;
      },
    },
  ),
);
