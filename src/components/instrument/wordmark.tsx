import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const WORD = "Morphogen";

/**
 * 1D concentration bump: letters bloom in the middle the way a
 * Gray-Scott inoculum spreads. Hero is more extreme; HUD stays legible.
 */
const STRETCH = {
  hero: [72, 96, 124, 146, 150, 138, 116, 92, 70],
  hud: [90, 104, 118, 130, 134, 124, 112, 100, 88],
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
      aria-label="Morphogen"
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
