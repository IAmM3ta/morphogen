import { useEffect, useState } from "react";
import { useV2 } from "@/lib/morphos-v2/store-v2";
import { VISUALS } from "@/lib/morphos-v2/visuals/presets";
import { lookStatus } from "@/lib/morphos-v2/rd-gpu/look";
import { Chip, Sheet, V2Slider } from "./bits";
import { cn } from "@/lib/utils";

export function LookPanel({ onClose }: { onClose: () => void }) {
  const visual = useV2((s) => s.visual);
  const setVisual = useV2((s) => s.setVisual);
  const scale = useV2((s) => s.scale);
  const reactivity = useV2((s) => s.reactivity);
  const morph = useV2((s) => s.morph);
  const setRd = useV2((s) => s.setRd);
  const [status, setStatus] = useState({ ...lookStatus });
  useEffect(() => {
    const id = window.setInterval(() => setStatus({ ...lookStatus }), 500);
    return () => window.clearInterval(id);
  }, []);
  const gpu = status.renderer === "webgpu";
  return (
    <Sheet title="Look" onClose={onClose}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {VISUALS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVisual(v.id)}
            aria-pressed={visual === v.id}
            title={v.blurb}
            className={cn(
              "flex min-h-14 flex-col justify-end rounded-xl p-2 text-left text-xs ring-1 ring-inset transition",
              visual === v.id ? "ring-fg" : "ring-fg/10 hover:ring-fg/40",
            )}
            style={{ backgroundImage: v.swatch }}
          >
            <span className="rounded bg-bg/70 px-1.5 py-0.5 text-fg">{v.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <V2Slider label="Pattern scale" value={scale} min={0.6} max={1.6} onChange={(n) => setRd({ scale: n })} format={(n) => `${n.toFixed(2)}×`} />
        <V2Slider label="Sound drives growth" value={reactivity} min={0} max={1.5} onChange={(n) => setRd({ reactivity: n })} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip active={morph} onClick={() => setRd({ morph: !morph })} label="Drift between pattern regimes">
          Morph regimes
        </Chip>
        <span className="font-mono text-[10px] tracking-[0.1em] text-muted">
          {gpu ? "WebGPU" : status.renderer === "webgl2" ? "WebGL2 fallback" : "…"}
          {status.simW ? ` · ${status.simW}×${status.simH}` : ""}
          {gpu && status.steps ? ` · ${status.steps} steps` : ""}
          {gpu && morph && status.regime ? ` · → ${status.regime}` : ""}
        </span>
      </div>
      {!gpu && status.renderer === "webgl2" && (
        <p className="mt-2 text-[11px] text-muted">
          This browser has no WebGPU, so looks recolour the classic field. Relief, symmetry and sound-driven growth need WebGPU.
        </p>
      )}
    </Sheet>
  );
}
