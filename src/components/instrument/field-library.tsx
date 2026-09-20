import { useState } from "react";
import { Bookmark, Camera, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstrument } from "@/lib/morphogen/store";
import { toast } from "sonner";
import type { Origin } from "@/lib/morphogen/origin";
import { originStamp } from "@/lib/morphogen/origin";
import { packEdition, pressImage, type PressMode } from "@/lib/morphogen/press";
import { downloadBlob } from "@/lib/morphogen/recorder";

export type FieldShot = {
  id: string;
  url: string;
  name: string;
  origin: Origin;
};

export function FieldLibrary({
  shots,
  onCapture,
  onDownloadShot,
}: {
  shots: FieldShot[];
  onCapture: () => void;
  onDownloadShot: (id: string) => void;
}) {
  const patches = useInstrument((s) => s.patches);
  const savePatch = useInstrument((s) => s.savePatch);
  const loadPatch = useInstrument((s) => s.loadPatch);
  const deletePatch = useInstrument((s) => s.deletePatch);
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<PressMode>("kaleido");
  const [busy, setBusy] = useState(false);
  const shot = shots.find((s) => s.id === picked) ?? shots[0] ?? null;

  const pack = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      const src = await fetch(shot.url).then((r) => r.blob());
      const png = await pressImage(src, mode);
      const zip = await packEdition(png, shot.origin, mode);
      downloadBlob(zip, `MORPHOS-${originStamp(shot.origin.capturedAt)}.zip`);
      toast("Edition packed");
    } catch {
      toast("Could not pack the edition");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Patches</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Store this chemistry — F, k, diffusion, species, colour — and recall it without reseeding.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => {
            const p = savePatch();
            toast(`Saved ${p.name}`);
          }}
        >
          <Bookmark /> Save settings
        </Button>
        {patches.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {patches.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-sm px-2 py-1.5 shadow-[var(--shadow-border)]">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-xs text-fg" onClick={() => loadPatch(p.id)}>
                  {p.name}
                  <span className="mt-0.5 block text-faint">
                    F {p.params.feed.toFixed(3)} · k {p.params.kill.toFixed(3)}
                  </span>
                </button>
                <button type="button" className="text-muted hover:text-fg" onClick={() => deletePatch(p.id)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Capture</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Still of the living field, with origin — pose, chemistry, voice. The seed of the edition.
        </p>
        <Button variant="ghost" size="sm" className="w-full" onClick={onCapture}>
          <Camera /> Screenshot
        </Button>
        {shots.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {shots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPicked(s.id)}
                className={
                  shot?.id === s.id
                    ? "overflow-hidden rounded-sm ring-1 ring-fg"
                    : "overflow-hidden rounded-sm shadow-[var(--shadow-border)]"
                }
                title={s.name}
              >
                <img src={s.url} alt={s.name} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      {shot && (
        <div>
          <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Press</p>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Mirror and pack a 2048² still + origin.json for Resolume, TouchDesigner, or print.
          </p>
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            {(["none", "mirror-x", "kaleido"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? "rounded-sm bg-fg px-2 py-1.5 text-[10px] tracking-wide text-bg uppercase"
                    : "rounded-sm px-2 py-1.5 text-[10px] tracking-wide text-muted uppercase shadow-[var(--shadow-border)]"
                }
              >
                {m === "none" ? "Flat" : m === "mirror-x" ? "Book" : "Kaleido"}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="w-full" onClick={() => void pack()} disabled={busy}>
            <Package /> {busy ? "Packing…" : "Pack edition"}
          </Button>
        </div>
      )}
    </div>
  );
}
