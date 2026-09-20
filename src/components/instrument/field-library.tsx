import { useRef, useState } from "react";
import { Bookmark, Camera, Package, Printer, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { artistFromState, useInstrument } from "@/lib/morphogen/store";
import { toast } from "sonner";
import type { Origin } from "@/lib/morphogen/origin";
import { originStamp } from "@/lib/morphogen/origin";
import { packEdition, pressImage, type PressMode } from "@/lib/morphogen/press";
import { detectGlyphInBlob, encodeGlyphToken, glyphShareUrl, originToGlyph, renderSticker } from "@/lib/morphogen/glyph";
import { downloadBlob } from "@/lib/morphogen/recorder";

export type FieldShot = {
  id: string;
  url: string;
  name: string;
  origin: Origin;
};

const inputClass =
  "w-full rounded-sm bg-transparent px-2 py-1.5 text-xs text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-faint";

export function ScanPlate() {
  const recallGlyph = useInstrument((s) => s.recallGlyph);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          void detectGlyphInBlob(file)
            .then((g) => {
              if (!g) {
                toast("No glyph in that frame");
                return;
              }
              recallGlyph(g);
              const who = [g.a?.n, g.a?.ig ? `@${g.a.ig}` : "", g.a?.x ? `x.com/${g.a.x}` : ""]
                .filter(Boolean)
                .join(" · ");
              toast(who ? `Edition recalled · ${who}` : "Edition recalled");
              if (g.a?.u) {
                try {
                  const url = new URL(g.a.u);
                  toast(`Maker ${url.host}`);
                } catch {
                  /* ignore */
                }
              }
            })
            .catch(() => toast("Could not scan that frame"))
            .finally(() => setBusy(false));
        }}
      />
      <Button variant="secondary" size="sm" className="w-full" onClick={() => ref.current?.click()} disabled={busy}>
        <ScanLine /> {busy ? "Reading…" : "Scan edition"}
      </Button>
    </>
  );
}

export function FieldLibrary({
  shots,
  onCapture,
  onDownloadShot: _onDownloadShot,
}: {
  shots: FieldShot[];
  onCapture: () => void;
  onDownloadShot: (id: string) => void;
}) {
  const patches = useInstrument((s) => s.patches);
  const savePatch = useInstrument((s) => s.savePatch);
  const loadPatch = useInstrument((s) => s.loadPatch);
  const deletePatch = useInstrument((s) => s.deletePatch);
  const artistName = useInstrument((s) => s.artistName);
  const artistUrl = useInstrument((s) => s.artistUrl);
  const artistIg = useInstrument((s) => s.artistIg);
  const artistX = useInstrument((s) => s.artistX);
  const patch = useInstrument((s) => s.patch);
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<PressMode>("none");
  const [busy, setBusy] = useState(false);
  const shot = shots.find((s) => s.id === picked) ?? shots[0] ?? null;

  const pack = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      const src = await fetch(shot.url).then((r) => r.blob());
      const png = await pressImage(src, mode);
      const origin = { ...shot.origin, artist: artistFromState(useInstrument.getState()) };
      const zip = await packEdition(png, origin, mode);
      downloadBlob(zip, `MORPHOS-${originStamp(shot.origin.capturedAt)}.zip`);
      toast("Edition packed · glyph inside");
    } catch {
      toast("Could not pack the edition");
    } finally {
      setBusy(false);
    }
  };

  const sticker = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      const src = await fetch(shot.url).then((r) => r.blob());
      const png = await pressImage(src, mode);
      const origin = { ...shot.origin, artist: artistFromState(useInstrument.getState()) };
      const token = encodeGlyphToken(originToGlyph(origin, origin.artist));
      const plate = await renderSticker(png, glyphShareUrl(token));
      downloadBlob(plate, `MORPHOS-${originStamp(shot.origin.capturedAt)}-sticker.png`);
      toast("Sticker ready to print");
    } catch {
      toast("Could not print the sticker");
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
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Maker</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Stamped into the glyph. Someone scanning your print can find you.
        </p>
        <div className="flex flex-col gap-1.5">
          <input className={inputClass} placeholder="Name" value={artistName} onChange={(e) => patch({ artistName: e.target.value })} />
          <input className={inputClass} placeholder="URL" value={artistUrl} onChange={(e) => patch({ artistUrl: e.target.value })} />
          <input className={inputClass} placeholder="Instagram" value={artistIg} onChange={(e) => patch({ artistIg: e.target.value })} />
          <input className={inputClass} placeholder="X" value={artistX} onChange={(e) => patch({ artistX: e.target.value })} />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Capture</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Still of the living field, with origin. Scan a glyph to restore it.
        </p>
        <div className="flex flex-col gap-1.5">
          <Button variant="ghost" size="sm" className="w-full" onClick={onCapture}>
            <Camera /> Screenshot
          </Button>
          <ScanPlate />
        </div>
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
            Flat is the still. Book and kaleido are optional. Print sticker is the
            field as a Camera-readable MORPHOS code.
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
          <div className="flex flex-col gap-1.5">
            <Button variant="secondary" size="sm" className="w-full" onClick={() => void sticker()} disabled={busy}>
              <Printer /> {busy ? "Printing…" : "Print sticker"}
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void pack()} disabled={busy}>
              <Package /> Pack edition
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
