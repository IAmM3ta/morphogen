import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_PARAMS,
  DEFAULT_PRESET,
  DEFAULT_WAVEFORM,
  paletteById,
  presetById,
  waveformById,
  type ImageMode,
  type SimParams,
  type WaveformId,
} from "./presets";
import { isRestoring, maybeCheckpoint } from "./history";
import { beginPresetMorph, resetRuntimeParams, runtime, DEFAULT_VIBRATO_DEPTH, DEFAULT_VIBRATO_RATE, DEFAULT_ORBIT_RATE, DEFAULT_LISTEN } from "./runtime";
import type { UndoSnap } from "./history";
import { DEFAULT_KEY, DEFAULT_MODE, DEFAULT_PITCH_MAX, DEFAULT_PITCH_MIN, clampPitchRange, isLegacyPitchWindow, keyById, modeById, type KeyId, type ModeId } from "./theory";
import type { Artist } from "./origin";
import type { Glyph } from "./glyph";
import { rememberGlyph } from "./glyph";
import type { Track } from "./release";

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
  pitchMinHz: number;
  pitchMaxHz: number;
  vibratoRate: number;
  vibratoDepth: number;
  orbitRate: number;
  listen: number;
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
  artistName: string;
  artistUrl: string;
  artistIg: string;
  artistX: string;
  audioName: string;
  audioUrl: string;
  audioIg: string;
  audioX: string;
  releaseTitle: string;
  trackTitle: string;
  tracks: Track[];
  applyPreset: (id: string) => void;
  restoreDefaults: () => void;
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  setWaveform: (id: WaveformId) => void;
  setKey: (id: KeyId, fromCompass?: boolean) => void;
  setMode: (id: ModeId) => void;
  setCompassKey: (on: boolean) => void;
  setPitchRange: (min: number, max: number) => void;
  setVibratoRate: (hz: number) => void;
  setVibratoDepth: (amt: number) => void;
  setOrbitRate: (hz: number) => void;
  setListen: (amt: number) => void;
  savePatch: (name?: string) => FieldPatch;
  loadPatch: (id: string) => void;
  deletePatch: (id: string) => void;
  setImageMode: (mode: ImageMode) => void;
  applySnapshot: (snap: UndoSnap) => void;
  recallGlyph: (g: Glyph) => void;
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
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
      compassKey: false,
      pitchMinHz: DEFAULT_PITCH_MIN,
      pitchMaxHz: DEFAULT_PITCH_MAX,
      vibratoRate: DEFAULT_VIBRATO_RATE,
      vibratoDepth: DEFAULT_VIBRATO_DEPTH,
      orbitRate: DEFAULT_ORBIT_RATE,
      listen: DEFAULT_LISTEN,
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
      artistName: "",
      artistUrl: "",
      artistIg: "",
      artistX: "",
      audioName: "",
      audioUrl: "",
      audioIg: "",
      audioX: "",
      releaseTitle: "",
      trackTitle: "",
      tracks: [],
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
        runtime.pitchMinHz = DEFAULT_PITCH_MIN;
        runtime.pitchMaxHz = DEFAULT_PITCH_MAX;
        runtime.vibratoRate = DEFAULT_VIBRATO_RATE;
        runtime.vibratoDepth = DEFAULT_VIBRATO_DEPTH;
        runtime.orbitRate = DEFAULT_ORBIT_RATE;
        runtime.listen = DEFAULT_LISTEN;
        set({
          params,
          presetId: DEFAULT_PRESET.id,
          waveform: DEFAULT_WAVEFORM,
          keyId: DEFAULT_KEY,
          modeId: DEFAULT_MODE,
          compassKey: false,
          pitchMinHz: DEFAULT_PITCH_MIN,
          pitchMaxHz: DEFAULT_PITCH_MAX,
          vibratoRate: DEFAULT_VIBRATO_RATE,
          vibratoDepth: DEFAULT_VIBRATO_DEPTH,
          orbitRate: DEFAULT_ORBIT_RATE,
          listen: DEFAULT_LISTEN,
          volume: 0.7,
          muted: false,
          audioOn: true,
          gyroOn: true,
        });
      },
      setParam: (key, value) => {
        maybeCheckpoint();
        const params = { ...get().params, [key]: value };
        pushParams(params);
        if (CHEM_KEYS.has(key)) runtime.morph = null;
        if (key === "paletteId") {
          const pal =
            value === "image" && runtime.customPalette
              ? runtime.customPalette
              : paletteById(String(value));
          runtime.liveStops = pal.stops;
        }
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
      setPitchRange: (min, max) => {
        const next = clampPitchRange(min, max);
        runtime.pitchMinHz = next.min;
        runtime.pitchMaxHz = next.max;
        set({ pitchMinHz: next.min, pitchMaxHz: next.max });
      },
      setVibratoRate: (hz) => {
        const n = Math.max(0.5, Math.min(12, Number.isFinite(hz) ? hz : DEFAULT_VIBRATO_RATE));
        runtime.vibratoRate = n;
        set({ vibratoRate: n });
      },
      setVibratoDepth: (amt) => {
        const n = Math.max(0, Math.min(1, Number.isFinite(amt) ? amt : DEFAULT_VIBRATO_DEPTH));
        runtime.vibratoDepth = n;
        set({ vibratoDepth: n });
      },
      setOrbitRate: (hz) => {
        const n = Math.max(0, Math.min(8, Number.isFinite(hz) ? hz : DEFAULT_ORBIT_RATE));
        runtime.orbitRate = n;
        set({ orbitRate: n });
      },
      setListen: (amt) => {
        const n = Math.max(0, Math.min(1, Number.isFinite(amt) ? amt : DEFAULT_LISTEN));
        runtime.listen = n;
        set({ listen: n });
      },
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
        runtime.pitchMinHz = typeof snap.pitchMinHz === "number" ? snap.pitchMinHz : DEFAULT_PITCH_MIN;
        runtime.pitchMaxHz = typeof snap.pitchMaxHz === "number" ? snap.pitchMaxHz : DEFAULT_PITCH_MAX;
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
          pitchMinHz: typeof snap.pitchMinHz === "number" ? snap.pitchMinHz : DEFAULT_PITCH_MIN,
          pitchMaxHz: typeof snap.pitchMaxHz === "number" ? snap.pitchMaxHz : DEFAULT_PITCH_MAX,
        });
      },
      recallGlyph: (g) => {
        maybeCheckpoint();
        rememberGlyph(g);
        const pal = paletteById(g.pa);
        const known = presetById(g.pr);
        const params = {
          ...get().params,
          feed: g.f,
          kill: g.k,
          du: g.du,
          dv: g.dv,
          paletteId: pal.id,
        };
        beginPresetMorph({
          feed: params.feed,
          kill: params.kill,
          du: params.du,
          dv: params.dv,
          stops: pal.stops,
        });
        resetRuntimeParams(params);
        const waveform = waveformById(g.w).id;
        const keyId = keyById(g.key).id;
        const modeId = modeById(g.mo).id;
        const range = clampPitchRange(g.lo, g.hi);
        runtime.waveform = waveform;
        runtime.keyId = keyId;
        runtime.modeId = modeId;
        runtime.pitchMinHz = range.min;
        runtime.pitchMaxHz = range.max;
        runtime.liveStops = pal.stops;
        set({
          params,
          presetId: known.id === g.pr ? known.id : "custom",
          waveform,
          keyId,
          modeId,
          pitchMinHz: range.min,
          pitchMaxHz: range.max,
        });
      },
      addTrack: (track) => {
        const tracks = [...get().tracks.filter((t) => t.id !== track.id), track].slice(0, 12);
        set({ tracks });
      },
      removeTrack: (id) => set({ tracks: get().tracks.filter((t) => t.id !== id) }),
      patch: (partial) => set(partial),
    }),
    {
      name: "morphogen-v15",
      partialize: (s) => ({
        params: s.params,
        presetId: s.presetId,
        waveform: s.waveform,
        keyId: s.keyId,
        modeId: s.modeId,
        compassKey: s.compassKey,
        pitchMinHz: s.pitchMinHz,
        pitchMaxHz: s.pitchMaxHz,
        vibratoRate: s.vibratoRate,
        vibratoDepth: s.vibratoDepth,
        orbitRate: s.orbitRate,
        listen: s.listen,
        volume: s.volume,
        tdUrl: s.tdUrl,
        tdGrid: s.tdGrid,
        gyroOn: s.gyroOn,
        audioOn: s.audioOn,
        patches: s.patches,
        artistName: s.artistName,
        artistUrl: s.artistUrl,
        artistIg: s.artistIg,
        artistX: s.artistX,
        audioName: s.audioName,
        audioUrl: s.audioUrl,
        audioIg: s.audioIg,
        audioX: s.audioX,
        releaseTitle: s.releaseTitle,
        trackTitle: s.trackTitle,
        tracks: s.tracks.map(({ id, title, origin }) => ({ id, title, origin, url: "" })),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const factoryRest = state.keyId === "C" && state.modeId === "ionian";
        const oldWindow = isLegacyPitchWindow(state.pitchMinHz, state.pitchMaxHz);
        if (oldWindow) {
          state.pitchMinHz = DEFAULT_PITCH_MIN;
          state.pitchMaxHz = DEFAULT_PITCH_MAX;
        }
        if (factoryRest && oldWindow) {
          state.keyId = DEFAULT_KEY;
          state.modeId = DEFAULT_MODE;
          state.compassKey = false;
        }
        const p0 = state.params;
        const mitosisRest =
          !!p0 &&
          state.presetId === "mitosis" &&
          p0.paletteId === "abyss" &&
          Math.abs(p0.feed - 0.037) < 0.001 &&
          Math.abs(p0.kill - 0.06) < 0.001;
        const coralRest =
          !!p0 &&
          state.presetId === "coral" &&
          p0.paletteId === "abyss" &&
          Math.abs(p0.feed - 0.0545) < 0.0015 &&
          Math.abs(p0.kill - 0.062) < 0.0015;
        const stranded =
          !!p0 &&
          (state.presetId === "scale" || p0.paletteId === "morpho") &&
          Math.abs(p0.feed - 0.046) < 0.002 &&
          Math.abs(p0.kill - 0.063) < 0.002;
        if ((mitosisRest || coralRest || stranded) && p0) {
          const living = presetById("living");
          state.presetId = living.id;
          state.params = {
            ...p0,
            feed: living.feed,
            kill: living.kill,
            du: living.du,
            dv: living.dv,
            paletteId: living.paletteId,
            glow: DEFAULT_PARAMS.glow,
            vignette: DEFAULT_PARAMS.vignette,
            steps: DEFAULT_PARAMS.steps,
          };
          runtime.seedNonce += 1;
        }
        resetRuntimeParams(state.params);
        runtime.waveform = state.waveform;
        runtime.keyId = state.keyId;
        runtime.modeId = state.modeId;
        if (typeof state.pitchMinHz === "number") runtime.pitchMinHz = state.pitchMinHz;
        if (typeof state.pitchMaxHz === "number") runtime.pitchMaxHz = state.pitchMaxHz;
        if (typeof state.vibratoRate !== "number") state.vibratoRate = DEFAULT_VIBRATO_RATE;
        if (typeof state.vibratoDepth !== "number") state.vibratoDepth = DEFAULT_VIBRATO_DEPTH;
        if (typeof state.orbitRate !== "number") state.orbitRate = DEFAULT_ORBIT_RATE;
        if (typeof state.listen !== "number") state.listen = DEFAULT_LISTEN;
        runtime.vibratoRate = state.vibratoRate;
        runtime.vibratoDepth = state.vibratoDepth;
        runtime.orbitRate = state.orbitRate;
        runtime.listen = state.listen;
      },
    },
  ),
);

/** True when chemistry, key, waveform, and mix sit at factory rest. */
export function isFactoryInstrument(s: InstrumentState): boolean {
  const d = DEFAULT_PARAMS;
  const p = s.params;
  return (
    s.presetId === DEFAULT_PRESET.id &&
    s.waveform === DEFAULT_WAVEFORM &&
    s.keyId === DEFAULT_KEY &&
    s.modeId === DEFAULT_MODE &&
    !s.compassKey &&
    Math.abs(s.pitchMinHz - DEFAULT_PITCH_MIN) < 0.5 &&
    Math.abs(s.pitchMaxHz - DEFAULT_PITCH_MAX) < 0.5 &&
    Math.abs(s.vibratoRate - DEFAULT_VIBRATO_RATE) < 0.05 &&
    s.vibratoDepth < 0.005 &&
    Math.abs(s.orbitRate - DEFAULT_ORBIT_RATE) < 0.05 &&
    Math.abs(s.listen - DEFAULT_LISTEN) < 0.05 &&
    Math.abs(s.volume - 0.7) < 1e-6 &&
    !s.muted &&
    s.audioOn &&
    s.gyroOn &&
    p.feed === d.feed &&
    p.kill === d.kill &&
    p.du === d.du &&
    p.dv === d.dv &&
    p.speed === d.speed &&
    p.brushSize === d.brushSize &&
    p.brushStrength === d.brushStrength &&
    p.paletteId === d.paletteId &&
    p.glow === d.glow &&
    p.vignette === d.vignette &&
    p.steps === d.steps
  );
}

export function artistFromState(s: Pick<InstrumentState, "artistName" | "artistUrl" | "artistIg" | "artistX">): Artist {
  return {
    name: s.artistName,
    url: s.artistUrl,
    instagram: s.artistIg,
    x: s.artistX,
  };
}

export function audioFromState(s: Pick<InstrumentState, "audioName" | "audioUrl" | "audioIg" | "audioX">): Artist {
  return {
    name: s.audioName,
    url: s.audioUrl,
    instagram: s.audioIg,
    x: s.audioX,
  };
}
