import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export const APP_NAME = "MORPHOS";
export const APP_TAGLINE = "Living Field";
export const APP_HOST = "morphos.grok.me";

const WORD = "MORPHOS";

/**
 * 1D concentration bump: letters bloom in the middle the way a
 * Gray-Scott inoculum spreads. Hero is more extreme; HUD stays legible.
 */
const STRETCH = {
  hero: [80, 104, 130, 150, 128, 102, 78],
  hud: [94, 110, 124, 136, 124, 110, 94],
} as const;

const WEIGHT = {
  hero: 320,
  hud: 500,
} as const;

export function Wordmark({
  variant = "hud",
  className,
}: {
  variant?: "hero" | "hud";
  className?: string;
}) {
  const stretch = STRETCH[variant];
  const weight = WEIGHT[variant];
  return (
    <span
      className={cn("wordmark", variant === "hero" ? "wordmark-hero" : "wordmark-hud", className)}
      aria-label={APP_NAME}
    >
      {[...WORD].map((ch, i) => {
        const w = stretch[i] ?? 100;
        return (
          <span
            key={`${ch}${i}`}
            style={
              {
                fontStretch: `${w}%`,
                fontVariationSettings: `"wdth" ${w}, "wght" ${weight}`,
                "--wdn": w,
                "--i": i,
              } as CSSProperties
            }
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}

export function LivingField({ className }: { className?: string }) {
  return (
    <p className={cn("font-mono uppercase tracking-[0.28em] text-muted", className)}>
      <span className="text-faint">{"<"}</span>
      {` ${APP_TAGLINE} `}
      <span className="text-faint">{">"}</span>
    </p>
  );
}
