import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_PARAMS,
  DEFAULT_PRESET,
  presetById,
  type ImageMode,
  type SimParams,
} from "./presets";
import { resetRuntimeParams, runtime } from "./runtime";

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
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  setImageMode: (mode: ImageMode) => void;
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
      gyroOn: false,
      micOn: false,
      cameraOn: false,
      audioOn: true,
      volume: 0.55,
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
        const preset = presetById(id);
        const params: SimParams = {
          ...get().params,
          feed: preset.feed,
          kill: preset.kill,
          du: preset.du,
          dv: preset.dv,
          paletteId: preset.paletteId,
        };
        pushParams(params);
        set({ presetId: id, params });
      },
      setParam: (key, value) => {
        const params = { ...get().params, [key]: value };
        pushParams(params);
        set({ params, presetId: key === "feed" || key === "kill" ? "custom" : get().presetId });
      },
      setImageMode: (mode) => {
        const params = { ...get().params, imageMode: mode };
        pushParams(params);
        set({ params });
      },
      patch: (partial) => set(partial),
    }),
    {
      name: "morphogen-v3",
      partialize: (s) => ({
        params: s.params,
        presetId: s.presetId,
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
