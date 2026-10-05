import { Button } from "@/components/ui/button";
import { Wordmark } from "./wordmark";

export function StartGate({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end bg-bg/78 px-5 pb-10 pt-[max(3rem,env(safe-area-inset-top))] sm:justify-center sm:px-12"
      data-ui
    >
      <div className="mx-auto w-full max-w-lg">
        <h1 className="mt-4 max-w-full text-wordmark text-fg">
          <Wordmark variant="hero" />
        </h1>
        <div className="mt-6 h-px w-16 bg-fg/35" />
        <p className="mt-6 max-w-md text-sm leading-relaxed text-muted">
          Tap to start sound. Drag to plant growth. Touch the field to hear it.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" onClick={onEnter} className="min-h-12 px-8 tracking-[0.14em] uppercase">
            Enter
          </Button>
        </div>
        <a
          href="/guide/Morphogen-Instrument-Guide.pdf"
          className="mt-6 inline-block text-xs tracking-[0.18em] text-faint uppercase hover:text-muted"
        >
          Instrument guide
        </a>
      </div>
    </div>
  );
}
