import { createFileRoute } from "@tanstack/react-router";
import { MorphogenApp } from "@/components/instrument/morphogen-app";

/**
 * Live-wallpaper surface: chrome-less, no start gate, no permission prompts.
 * Options: ?visual=temple-gold|marble|chrome-bloom|teal-beam|uv-mandala|projection|cymatic|off
 *          ?quality=low|auto|high  ?fps=30 (0 = uncapped)  ?dpr=2  ?audio=1
 */
export const Route = createFileRoute("/wallpaper")({ component: Wallpaper });

function Wallpaper() {
  return <MorphogenApp wallpaper />;
}
