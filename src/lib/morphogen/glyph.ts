import { encode } from "uqr";
import type { Artist, Origin } from "./origin";

/** Compact payload that a glyph plate / camera can restore. */
export type Glyph = {
  v: 1;
  f: number;
  k: number;
  du: number;
  dv: number;
  pr: string;
  pa: string;
  key: string;
  mo: string;
  w: string;
  lo: number;
  hi: number;
  a?: { n?: string; u?: string; ig?: string; x?: string };
};

export function originToGlyph(origin: Origin, artist?: Artist): Glyph {
  const a: Glyph["a"] = {};
  if (artist?.name.trim()) a.n = artist.name.trim().slice(0, 48);
  if (artist?.url.trim()) a.u = artist.url.trim().slice(0, 96);
  if (artist?.instagram.trim()) a.ig = artist.instagram.trim().replace(/^@/, "").slice(0, 32);
  if (artist?.x.trim()) a.x = artist.x.trim().replace(/^@/, "").slice(0, 32);
  const g: Glyph = {
    v: 1,
    f: origin.chemistry.feed,
    k: origin.chemistry.kill,
    du: origin.chemistry.du,
    dv: origin.chemistry.dv,
    pr: origin.chemistry.presetId,
    pa: origin.chemistry.paletteId,
    key: origin.voice.keyId,
    mo: origin.voice.modeId,
    w: origin.voice.waveform,
    lo: origin.voice.pitchMinHz,
    hi: origin.voice.pitchMaxHz,
  };
  if (a.n || a.u || a.ig || a.x) g.a = a;
  return g;
}

export function encodeGlyphToken(g: Glyph): string {
  const json = JSON.stringify(g);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `M1.${b64}`;
}

export function decodeGlyphToken(raw: string): Glyph | null {
  const text = raw.trim();
  let token = text;
  try {
    const url = new URL(text);
    token = url.searchParams.get("o") ?? text;
  } catch {
    const q = text.match(/[?&]o=([^&]+)/);
    if (q?.[1]) token = decodeURIComponent(q[1]);
  }
  if (token.startsWith("M1.")) {
    try {
      const b64 = token.slice(3).replace(/-/g, "+").replace(/_/g, "/");
      const pad = "=".repeat((4 - (b64.length % 4)) % 4);
      const json = decodeURIComponent(escape(atob(b64 + pad)));
      const g = JSON.parse(json) as Glyph;
      if (g?.v === 1 && typeof g.f === "number" && typeof g.k === "number") return g;
    } catch {
      return null;
    }
  }
  return null;
}

export function glyphShareUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://morphos.grok.me";
  return `${origin}/?o=${encodeURIComponent(token)}`;
}

/** Ivory plate, black modules, heavy frame — maze-like, still a QR. */
export async function renderGlyphPlate(token: string, size = 1024): Promise<Blob> {
  const qr = encode(token, { ecc: "M", border: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the glyph.");
  const paper = "#f4efe4";
  const ink = "#111111";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, size, size);
  const frame = Math.round(size * 0.055);
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = paper;
  ctx.fillRect(frame, frame, size - frame * 2, size - frame * 2);
  const inner = size - frame * 2;
  const pad = inner * 0.06;
  const field = inner - pad * 2;
  const cell = field / qr.size;
  const x0 = frame + pad;
  const y0 = frame + pad;
  ctx.fillStyle = ink;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.data[y]?.[x]) continue;
      const r = cell * 0.18;
      roundRect(ctx, x0 + x * cell, y0 + y * cell, cell * 0.94, cell * 0.94, r);
      ctx.fill();
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not print the glyph."));
    }, "image/png");
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export async function detectGlyphInImage(src: ImageBitmapSource): Promise<Glyph | null> {
  const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const det = new Detector({ formats: ["qr_code"] });
    const codes = await det.detect(src);
    for (const c of codes) {
      const g = decodeGlyphToken(c.rawValue);
      if (g) return g;
    }
  } catch {
    return null;
  }
  return null;
}

export async function detectGlyphInBlob(blob: Blob): Promise<Glyph | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read the plate."));
      img.src = url;
    });
    return detectGlyphInImage(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}
