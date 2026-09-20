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

/** Two identical Morpho wing silhouettes. Fill is Abyss mid-blue; outline is the living teal. */
export function MorphoMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      aria-hidden={!title}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g fill="#1e88c4" stroke="#8fe8dc" strokeWidth="0.55" strokeLinejoin="round" strokeLinecap="round">
        <path d="M15.35 10.1C10.6 5.6 4.9 7.5 4.4 13.2C3.95 17.2 8.7 18.6 14.2 15.7C14.9 14 15.35 12 15.35 10.1Z" />
        <path d="M15.45 15.45C9.3 16.2 5.55 20.5 6.75 24.55C7.65 27.15 12.45 26.65 15.15 22.25C15.55 20.05 15.55 17.35 15.45 15.45Z" />
        <path d="M16.65 10.1C21.4 5.6 27.1 7.5 27.6 13.2C28.05 17.2 23.3 18.6 17.8 15.7C17.1 14 16.65 12 16.65 10.1Z" />
        <path d="M16.55 15.45C22.7 16.2 26.45 20.5 25.25 24.55C24.35 27.15 19.55 26.65 16.85 22.25C16.45 20.05 16.45 17.35 16.55 15.45Z" />
      </g>
      <ellipse cx="16" cy="16.4" rx="1.05" ry="6.15" fill="#07080a" />
      <circle cx="16" cy="10.15" r="1.2" fill="#07080a" />
    </svg>
  );
}

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
