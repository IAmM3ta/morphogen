/**
 * MORPHOS v2 UI state (persisted separately from the v1 instrument store so
 * nothing in "morphogen-v15" changes shape).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_DRONE, type DroneSettings } from "./drone";
import { DEFAULT_BASS, type BassSettings } from "./bass";
import type { Mode } from "./sound-v2";
import { VISUALS, type VisualId } from "./visuals/presets";
import { setLook } from "./rd-gpu/look";

export type PanelId = "drone" | "bass" | "loop" | "look" | null;

type V2State = {
  mode: Mode;
  visual: VisualId;
  drone: DroneSettings;
  bass: BassSettings;
  scale: number;
  reactivity: number;
  morph: boolean;
  panel: PanelId;
  /** Clear glass: every control hidden, just the field. */
  glass: boolean;
  coach: Record<string, boolean>;
  setMode: (m: Mode) => void;
  setVisual: (v: VisualId) => void;
  cycleVisual: (dir?: 1 | -1) => void;
  setDrone: (p: Partial<DroneSettings>) => void;
  setBass: (p: Partial<BassSettings>) => void;
  setRd: (p: Partial<Pick<V2State, "scale" | "reactivity" | "morph">>) => void;
  setPanel: (p: PanelId) => void;
  setGlass: (on: boolean) => void;
  seen: (key: string) => void;
};

export const useV2 = create<V2State>()(
  persist(
    (set, get) => ({
      mode: "field",
      visual: "off",
      drone: { ...DEFAULT_DRONE },
      bass: { ...DEFAULT_BASS },
      scale: 1,
      reactivity: 1,
      morph: true,
      panel: null,
      glass: false,
      coach: {},
      setMode: (mode) => set({ mode, panel: mode === "field" ? null : mode }),
      setVisual: (visual) => {
        setLook({ visual });
        set({ visual });
      },
      cycleVisual: (dir = 1) => {
        const i = VISUALS.findIndex((v) => v.id === get().visual);
        const next = VISUALS[(i + dir + VISUALS.length) % VISUALS.length]!.id;
        setLook({ visual: next });
        set({ visual: next });
      },
      setDrone: (p) => set({ drone: { ...get().drone, ...p } }),
      setBass: (p) => set({ bass: { ...get().bass, ...p } }),
      setRd: (p) => {
        setLook(p);
        set(p);
      },
      setPanel: (panel) => set({ panel }),
      setGlass: (glass) => set({ glass, panel: glass ? null : get().panel }),
      seen: (key) => set({ coach: { ...get().coach, [key]: true } }),
    }),
    {
      name: "morphos-v2",
      version: 1,
      partialize: (s) => ({
        mode: s.mode,
        visual: s.visual,
        drone: s.drone,
        bass: s.bass,
        scale: s.scale,
        reactivity: s.reactivity,
        morph: s.morph,
        coach: s.coach,
      }),
      onRehydrateStorage: () => (s) => {
        if (s) setLook({ visual: s.visual, scale: s.scale, reactivity: s.reactivity, morph: s.morph });
      },
    },
  ),
);
