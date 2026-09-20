import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decodeGlyphToken, type Glyph } from "@/lib/morphogen/glyph";
import { lerpQuad, quadMatrix3d, scaleQuad, type Pt } from "@/lib/morphogen/homography";

type Detector = {
  detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue: string; cornerPoints?: Pt[] }>>;
};

export function ArOverlay({
  field,
  onClose,
  onLock,
  onWake,
}: {
  field: HTMLCanvasElement | null;
  onClose: () => void;
  onLock: (g: Glyph) => void;
  onWake?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const copyRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState<Glyph | null>(null);
  const [live, setLive] = useState(false);
  const onCloseRef = useRef(onClose);
  const onLockRef = useRef(onLock);
  onCloseRef.current = onClose;
  onLockRef.current = onLock;
  const smooth = useRef<[Pt, Pt, Pt, Pt] | null>(null);
  const lost = useRef(0);
  const seen = useRef("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let det: Detector | null = null;
    const Detector = (
      window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
    ).BarcodeDetector;
    if (Detector) det = new Detector({ formats: ["qr_code"] });

    const video = videoRef.current;
    const copy = copyRef.current;
    if (!video || !copy) return;

    const loop = async () => {
      if (field && field.width > 0) {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(field.width, field.height));
        const w = Math.max(1, Math.round(field.width * scale));
        const h = Math.max(1, Math.round(field.height * scale));
        if (copy.width !== w || copy.height !== h) {
          copy.width = w;
          copy.height = h;
        }
        const ctx = copy.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(field, 0, 0, w, h);
          punchVoid(ctx, w, h);
        }
      }
      if (det && video.readyState >= 2) {
        try {
          const codes = await det.detect(video);
          const hit = codes.find((c) => decodeGlyphToken(c.rawValue));
          const corners = hit?.cornerPoints;
          if (hit && corners && corners.length === 4) {
            lost.current = 0;
            const g = decodeGlyphToken(hit.rawValue);
            if (g && seen.current !== hit.rawValue) {
              seen.current = hit.rawValue;
              setLocked(g);
              onLockRef.current(g);
            }
            const view = video.getBoundingClientRect();
            const host = hostRef.current?.getBoundingClientRect() ?? view;
            const mapped = scaleQuad(mapCorners(corners as [Pt, Pt, Pt, Pt], video, view, host), 1.16);
            smooth.current = smooth.current ? lerpQuad(smooth.current, mapped, 0.38) : mapped;
            const q = smooth.current;
            copy.style.transform = quadMatrix3d(copy.width, copy.height, q);
            copy.style.opacity = "1";
            setLive(true);
          } else {
            lost.current += 1;
            if (lost.current > 18) {
              copy.style.opacity = "0";
              setLive(false);
              smooth.current = null;
            }
          }
        } catch {
          /* detector can throw while the frame is empty */
        }
      }
      raf = requestAnimationFrame(() => void loop());
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        raf = requestAnimationFrame(() => void loop());
      } catch {
        onCloseRef.current();
      }
    })();

    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [field]);

  const maker = [locked?.a?.n, locked?.a?.s].filter(Boolean).join(" · ");

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 z-50 bg-black"
      data-ui
      onPointerDown={() => onWake?.()}
    >
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted autoPlay />
      <canvas
        ref={copyRef}
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ opacity: 0, willChange: "transform" }}
      />
      <div className="pointer-events-none absolute inset-0 ring-inset ring-1 ring-fg/10" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="max-w-[70%] font-mono text-[10px] tracking-[0.16em] text-fg uppercase">
          {live ? `Alive${maker ? ` · ${maker}` : ""}` : "Hold the print in the frame"}
        </p>
        <Button variant="ghost" size="icon-sm" className="pointer-events-auto" onClick={onClose} aria-label="Close finder">
          <X />
        </Button>
      </div>
      {!live && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="size-44 rounded-sm border border-fg/35" />
        </div>
      )}
    </div>
  );
}

function mapCorners(
  corners: [Pt, Pt, Pt, Pt],
  video: HTMLVideoElement,
  view: DOMRect,
  host: DOMRect,
): [Pt, Pt, Pt, Pt] {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const scale = Math.max(view.width / vw, view.height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = view.left + (view.width - dw) / 2 - host.left;
  const oy = view.top + (view.height - dh) / 2 - host.top;
  return corners.map((p) => ({ x: ox + p.x * scale, y: oy + p.y * scale })) as [Pt, Pt, Pt, Pt];
}

/** Void of the field becomes glass — the paper is the artwork, colonies are the layer. */
function punchVoid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = (0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0)) / 255;
    const a = Math.max(0, Math.min(1, (y - 0.06) / 0.32));
    d[i + 3] = Math.round(a * a * 255);
  }
  ctx.putImageData(img, 0, 0);
}
