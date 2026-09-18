import { Bookmark, Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstrument } from "@/lib/morphogen/store";
import { toast } from "sonner";

export type FieldShot = {
  id: string;
  url: string;
  name: string;
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
        <p className="mb-3 text-xs leading-relaxed text-muted">Still of the living field. Saved to this device.</p>
        <Button variant="ghost" size="sm" className="w-full" onClick={onCapture}>
          <Camera /> Screenshot
        </Button>
        {shots.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {shots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onDownloadShot(s.id)}
                className="overflow-hidden rounded-sm shadow-[var(--shadow-border)]"
                title={s.name}
              >
                <img src={s.url} alt={s.name} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
