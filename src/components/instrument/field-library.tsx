import { useRef, useState } from "react";
import { Bookmark, Camera, Disc3, Package, Printer, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { artistFromState, audioFromState, useInstrument } from "@/lib/morphogen/store";
import { toast } from "sonner";
import type { Origin } from "@/lib/morphogen/origin";
import { originStamp } from "@/lib/morphogen/origin";
import { packEdition, pressImage, type PressMode } from "@/lib/morphogen/press";
import { detectGlyphInBlob, encodeGlyphToken, glyphShareUrl, originToGlyph, renderSticker } from "@/lib/morphogen/glyph";
import { renderSleeve } from "@/lib/morphogen/release";
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
  const audioName = useInstrument((s) => s.audioName);
  const audioUrl = useInstrument((s) => s.audioUrl);
  const audioIg = useInstrument((s) => s.audioIg);
  const audioX = useInstrument((s) => s.audioX);
  const releaseTitle = useInstrument((s) => s.releaseTitle);
  const trackTitle = useInstrument((s) => s.trackTitle);
  const tracks = useInstrument((s) => s.tracks);
  const addTrack = useInstrument((s) => s.addTrack);
  const removeTrack = useInstrument((s) => s.removeTrack);
  const patch = useInstrument((s) => s.patch);
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<PressMode>("none");
  const [busy, setBusy] = useState(false);
  const shot = shots.find((s) => s.id === picked) ?? shots[0] ?? null;

  const pack = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      const st = useInstrument.getState();
      const src = await fetch(shot.url).then((r) => r.blob());
      const png = await pressImage(src, mode);
      const origin = {
        ...shot.origin,
        artist: artistFromState(st),
        audio: audioFromState(st),
        release: st.releaseTitle,
        track: st.trackTitle,
      };
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
      const st = useInstrument.getState();
      const src = await fetch(shot.url).then((r) => r.blob());
      const png = await pressImage(src, mode);
      const origin = {
        ...shot.origin,
        artist: artistFromState(st),
        audio: audioFromState(st),
        release: st.releaseTitle,
        track: st.trackTitle,
      };
      const token = encodeGlyphToken(originToGlyph(origin, origin.artist, origin.audio));
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
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Credits</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Visual look and audio voice can be two people. Both stamp the glyph.
        </p>
        <p className="mb-1 text-[10px] tracking-[0.16em] text-faint uppercase">Visual</p>
        <div className="mb-2 flex flex-col gap-1.5">
          <input className={inputClass} placeholder="Name" value={artistName} onChange={(e) => patch({ artistName: e.target.value })} />
          <input className={inputClass} placeholder="@handle or URL" value={artistIg || artistUrl} onChange={(e) => {
            const v = e.target.value;
            patch(v.startsWith("http") ? { artistUrl: v } : { artistIg: v.replace(/^@/, "") });
          }} />
        </div>
        <p className="mb-1 text-[10px] tracking-[0.16em] text-faint uppercase">Audio</p>
        <div className="flex flex-col gap-1.5">
          <input className={inputClass} placeholder="Name" value={audioName} onChange={(e) => patch({ audioName: e.target.value })} />
          <input className={inputClass} placeholder="@handle or URL" value={audioIg || audioUrl} onChange={(e) => {
            const v = e.target.value;
            patch(v.startsWith("http") ? { audioUrl: v } : { audioIg: v.replace(/^@/, "") });
          }} />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Release</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          An album is a sequence of glyphs. Each sticker is a track.
        </p>
        <div className="flex flex-col gap-1.5">
          <input className={inputClass} placeholder="Release title" value={releaseTitle} onChange={(e) => patch({ releaseTitle: e.target.value })} />
          <input className={inputClass} placeholder="This track" value={trackTitle} onChange={(e) => patch({ trackTitle: e.target.value })} />
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
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                if (!shot) return;
                const st = useInstrument.getState();
                const title = st.trackTitle.trim() || `Track ${st.tracks.length + 1}`;
                addTrack({
                  id: shot.id,
                  title,
                  origin: {
                    ...shot.origin,
                    artist: artistFromState(st),
                    audio: audioFromState(st),
                    release: st.releaseTitle,
                    track: title,
                    index: st.tracks.length,
                  },
                  url: shot.url,
                });
                toast(`${title} on the sleeve`);
              }}
            >
              <Disc3 /> Add to release
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void pack()} disabled={busy}>
              <Package /> Pack edition
            </Button>
            {tracks.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void (async () => {
                    try {
                      const st = useInstrument.getState();
                      const plates = [];
                      for (const t of st.tracks) {
                        if (!t.url) continue;
                        const src = await fetch(t.url).then((r) => r.blob());
                        const png = await pressImage(src, "none");
                        const token = encodeGlyphToken(originToGlyph(t.origin, t.origin.artist, t.origin.audio));
                        const plate = await renderSticker(png, glyphShareUrl(token));
                        plates.push({ png: plate, title: t.title });
                      }
                      if (!plates.length) {
                        toast("Capture tracks this session to print a sleeve");
                        return;
                      }
                      const sleeve = await renderSleeve({
                        title: st.releaseTitle || "Untitled",
                        visual: st.artistName,
                        audio: st.audioName,
                        plates,
                      });
                      downloadBlob(sleeve, `MORPHOS-${(st.releaseTitle || "sleeve").replace(/\s+/g, "-")}.png`);
                      toast("Sleeve ready");
                    } catch {
                      toast("Could not print the sleeve");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <Disc3 /> Print sleeve · {tracks.length}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
