import { Button } from "@/components/ui/button";
import { Wordmark } from "./wordmark";

export function StartGate({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end bg-bg/72 px-5 pb-10 pt-[max(3rem,env(safe-area-inset-top))] sm:justify-center sm:px-12"
      data-ui
    >
      <div className="mx-auto w-full max-w-lg">
        <p className="text-xs tracking-[0.22em] text-muted uppercase">Theremin · reaction-diffusion</p>
        <h1 className="mt-3 max-w-full text-wordmark text-fg">
          <Wordmark variant="hero" />
        </h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
          A living chemical field you play like a theremin. Height is pitch.
          Each finger is a voice — colonies bloom under contact. Pick a
          waveform in Sound. Species morph in place. Undo the last change.
          Double-tap and hold to lock a loop.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" onClick={onEnter} className="min-h-12 px-6">
            Enter the field
          </Button>
          <p className="text-xs text-faint sm:ml-2">
            First gesture unlocks audio, motion, and the voices.
          </p>
        </div>
      </div>
    </div>
  );
}
