import { useSyncExternalStore } from "react";
import { Disc3, Grid3x3, Hand, Palette, Waves } from "lucide-react";
import { MODES, type Mode, type SoundV2 } from "@/lib/morphos-v2/sound-v2";
import { useV2 } from "@/lib/morphos-v2/store-v2";
import { cn } from "@/lib/utils";
import { DronePanel } from "./drone-panel";
import { BassPanel } from "./bass-panel";
import { LoopPanel } from "./loop-panel";
import { LookPanel } from "./look-panel";

const ICON: Record<Mode, typeof Hand> = { field: Hand, drone: Waves, bass: Disc3, loop: Grid3x3 };

const NOOP_SNAP = {
  version: 0,
  playing: false,
  step: -1,
  recArmed: false,
  recording: false,
  overdub: false,
  bassRec: false,
  queued: null,
  canUndo: false,
  hold: false,
  shimmer: false,
};
const noopSub = () => () => {};
const noopGet = () => NOOP_SNAP;

/** Mode bar + performance sheets, shown while the chrome is hidden. */
export function V2Dock({
  sound,
  motion,
  onEnableMotion,
}: {
  sound: SoundV2 | null;
  motion: "on" | "denied" | "off";
  onEnableMotion: () => void;
}) {
  const mode = useV2((s) => s.mode);
  const panel = useV2((s) => s.panel);
  const setMode = useV2((s) => s.setMode);
  const setPanel = useV2((s) => s.setPanel);
  const snap = useSyncExternalStore(sound?.subscribe ?? noopSub, sound?.getSnapshot ?? noopGet, noopGet);
  const close = () => setPanel(null);
  const hint = MODES.find((m) => m.id === mode)?.hint ?? "";
  return (
    <div
      data-ui
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {sound && panel === "drone" && (
        <DronePanel sound={sound} snap={snap} motion={motion} onEnableMotion={onEnableMotion} onClose={close} />
      )}
      {sound && panel === "bass" && <BassPanel sound={sound} snap={snap} onClose={close} />}
      {sound && panel === "loop" && <LoopPanel sound={sound} snap={snap} onClose={close} />}
      {panel === "look" && <LookPanel onClose={close} />}
      {!panel && mode !== "field" && <p className="pointer-events-none max-w-xs text-center text-[11px] text-fg/70">{hint}</p>}
      <nav
        data-ui
        aria-label="Play mode"
        className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-bg/30 p-1 shadow-[var(--shadow-border)] backdrop-blur-md"
      >
        {MODES.map((m) => {
          const Icon = ICON[m.id];
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                if (on && m.id !== "field") setPanel(panel === m.id ? null : m.id);
                else setMode(m.id);
              }}
              aria-pressed={on}
              aria-label={`${m.label} mode`}
              title={m.hint}
              className={cn(
                "flex min-h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-full text-[9px] tracking-[0.14em] uppercase",
                on ? "bg-fg text-bg" : "text-fg/85",
              )}
            >
              <Icon className="size-4" />
              {m.label}
              {m.id === "loop" && snap.playing && <span className="sr-only">(playing)</span>}
            </button>
          );
        })}
        <span aria-hidden className="mx-0.5 h-6 w-px bg-fg/20" />
        <button
          type="button"
          onClick={() => setPanel(panel === "look" ? null : "look")}
          aria-pressed={panel === "look"}
          aria-label="Look"
          title="Colourings of the field: Marble, Temple Gold, Chrome Bloom, Teal Beam, UV Mandala, Projection"
          className={cn(
            "flex min-h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-full text-[9px] tracking-[0.14em] uppercase",
            panel === "look" ? "bg-fg text-bg" : "text-fg/85",
          )}
        >
          <Palette className="size-4" />
          Look
        </button>
      </nav>
    </div>
  );
}
