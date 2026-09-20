import { Button } from "@/components/ui/button";
import { LivingField, MorphoMark, Wordmark } from "./wordmark";
import type { Glyph } from "@/lib/morphogen/glyph";

export function StartGate({
  onEnter,
  edition,
}: {
  onEnter: () => void;
  edition?: Glyph | null;
}) {
  const maker = edition?.a?.n;
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end bg-bg/78 px-5 pb-10 pt-[max(3rem,env(safe-area-inset-top))] sm:justify-center sm:px-12"
      data-ui
    >
      <div className="mx-auto w-full max-w-lg">
        <MorphoMark className="mb-4 size-12" title="MORPHOS" />
        <LivingField className="text-[10px]" />
        <h1 className="mt-3 max-w-full text-wordmark text-fg">
          <Wordmark variant="hero" />
        </h1>
        <div className="mt-6 h-px w-16 bg-fg/35" />
        {edition ? (
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted">
            This sticker is a living field
            {maker ? ` left by ${maker}` : ""}. Enter loads their chemistry
            and voice. Remix it. Print your own.
          </p>
        ) : (
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted">
            A living chemical field. First touch voices a chant — overtones
            in the current key, then it recedes when you lift. How you hold
            the phone is the other antenna. Height is pitch, across is
            amplitude. Fingers leave no marks. Double-tap and hold to freeze
            a generation.
          </p>
        )}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" onClick={onEnter} className="min-h-12 px-8 tracking-[0.14em] uppercase">
            {edition ? "Remix" : "Enter"}
          </Button>
          <Button asChild size="lg" variant="secondary" className="min-h-12 px-8 tracking-[0.14em] uppercase">
            <a href="/guide/Morphos-Instrument-Guide.pdf" download="Morphos-Instrument-Guide.pdf">
              Guide
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs tracking-wide text-faint">
          {edition
            ? "Camera opened MORPHOS. Add to Home Screen so the next sticker launches the app."
            : "Enter unlocks audio. First tap voices the field."}
        </p>
      </div>
    </div>
  );
}