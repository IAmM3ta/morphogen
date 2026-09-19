import { Button } from "@/components/ui/button";
import { Wordmark } from "./wordmark";

export function StartGate({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end bg-bg/78 px-5 pb-10 pt-[max(3rem,env(safe-area-inset-top))] sm:justify-center sm:px-12"
      data-ui
    >
      <div className="mx-auto w-full max-w-lg">
        <p className="text-xs tracking-[0.38em] text-muted uppercase">Earth cavity · 7.83 Hz</p>
        <h1 className="mt-4 max-w-full text-wordmark text-fg">
          <Wordmark variant="hero" />
        </h1>
        <div className="mt-6 h-px w-16 bg-fg/35" />
        <p className="mt-6 max-w-md text-sm leading-relaxed text-muted">
          A living chemical field. The Hum is always on. How you hold the
          phone is the other antenna — tilt, roll, spin, compass. Height is
          pitch, across is amplitude. Voices lock to a key. Fingers play;
          they leave no marks. Double-tap and hold to freeze a generation.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" onClick={onEnter} className="min-h-12 px-8 tracking-[0.14em] uppercase">
            Enter
          </Button>
          <Button asChild size="lg" variant="secondary" className="min-h-12 px-8 tracking-[0.14em] uppercase">
            <a href="/guide/Morphogen-Instrument-Guide.pdf" download="Morphogen-Instrument-Guide.pdf">
              Guide
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs tracking-wide text-faint">First gesture unlocks audio and motion.</p>
      </div>
    </div>
  );
}
