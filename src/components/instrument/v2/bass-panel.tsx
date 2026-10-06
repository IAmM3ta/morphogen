import { useState } from "react";
import { useV2 } from "@/lib/morphos-v2/store-v2";
import { BASS_STYLES } from "@/lib/morphos-v2/bass";
import { STEPS } from "@/lib/morphos-v2/loop";
import type { SoundV2, SoundV2Snapshot } from "@/lib/morphos-v2/sound-v2";
import { Chip, Sheet, V2Slider } from "./bits";
import { cn } from "@/lib/utils";

export function BassPanel({ sound, snap, onClose }: { sound: SoundV2; snap: SoundV2Snapshot; onClose: () => void }) {
  const bass = useV2((s) => s.bass);
  const setBass = useV2((s) => s.setBass);
  const [sel, setSel] = useState(0);
  const set = (p: Partial<typeof bass>) => {
    setBass(p);
    sound.setBass(p);
  };
  const steps = sound.pattern.bass;
  const cur = steps[sel]!;
  return (
    <Sheet title="Bass" onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        {BASS_STYLES.map((s) => (
          <Chip key={s.id} active={bass.style === s.id} onClick={() => set({ style: s.id })} label={s.blurb}>
            {s.name}
          </Chip>
        ))}
        <Chip active={snap.playing} onClick={() => sound.togglePlay()} label={snap.playing ? "Stop the loop" : "Play the loop"}>
          {snap.playing ? "Stop" : "Play"}
        </Chip>
        <Chip active={snap.bassRec} onClick={() => sound.toggleBassRec()} label="Write steps from your finger while the loop plays">
          Rec finger
        </Chip>
      </div>
      <div className="mt-3 grid grid-cols-16 gap-0.5" role="group" aria-label="Bass steps">
        {Array.from({ length: STEPS }, (_, i) => {
          const s = steps[i]!;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (sel === i) sound.toggleBassStep(i);
                setSel(i);
              }}
              aria-label={`Bass step ${i + 1}${s.on ? " on" : ""}`}
              title={`Step ${i + 1}: tap to select, tap again to toggle`}
              className={cn(
                "relative h-9 rounded-sm",
                s.on ? (s.accent ? "bg-fg" : "bg-fg/60") : i % 4 === 0 ? "bg-fg/14" : "bg-fg/7",
                sel === i && "ring-2 ring-fg/80",
                snap.step === i && "outline outline-1 outline-offset-1 outline-fg/70",
              )}
            >
              {s.on && s.slide && <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-bg/80" />}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted">Step {sel + 1}</span>
        <Chip onClick={() => sound.editBassStep(sel, { degree: cur.degree - 1, on: true })} label="Lower note">
          −
        </Chip>
        <span className="w-8 text-center font-mono text-xs">{cur.degree}</span>
        <Chip onClick={() => sound.editBassStep(sel, { degree: cur.degree + 1, on: true })} label="Raise note">
          +
        </Chip>
        <Chip onClick={() => sound.editBassStep(sel, { degree: cur.degree + 7, on: true })} label="Up an octave">
          8va
        </Chip>
        <Chip active={cur.accent} onClick={() => sound.editBassStep(sel, { accent: !cur.accent })} label="Accent">
          Accent
        </Chip>
        <Chip active={cur.slide} onClick={() => sound.editBassStep(sel, { slide: !cur.slide })} label="Slide into the next step">
          Slide
        </Chip>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <V2Slider label="Cutoff" value={bass.cutoff} onChange={(n) => set({ cutoff: n })} />
        <V2Slider label="Resonance" value={bass.resonance} onChange={(n) => set({ resonance: n })} />
        <V2Slider label="Env" value={bass.envMod} onChange={(n) => set({ envMod: n })} />
        <V2Slider label="Decay" value={bass.decay} onChange={(n) => set({ decay: n })} />
        <V2Slider label="Drive" value={bass.drive} onChange={(n) => set({ drive: n })} />
        <V2Slider label="Level" value={bass.level} onChange={(n) => set({ level: n })} />
      </div>
      <p className="mt-2 text-[11px] text-muted">Your finger plays the bass. Tap steps to write a line.</p>
    </Sheet>
  );
}
