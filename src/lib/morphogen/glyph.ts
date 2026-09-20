import { encode, QrCodeDataType } from "uqr";
import type { Artist, Origin } from "./origin";

export const CANONICAL_ORIGIN = "https://morphos.grok.me";

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

export let lastRecalledGlyph: Glyph | null = null;

export function rememberGlyph(g: Glyph | null) {
  lastRecalledGlyph = g;
}

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
  if (/^(web\+)?morphos:/i.test(text)) {
    token = text.replace(/^(web\+)?morphos:\/+/i, "").replace(/^o\/?/i, "");
    try {
      token = decodeURIComponent(token);
    } catch {
      /* keep */
    }
  }
  try {
    const url = new URL(text);
    token = url.searchParams.get("o") ?? token;
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

/** Live grok.me host so a phone camera opens THIS instrument. Canonical name is morphos.grok.me. */
export function publicOrigin() {
  if (typeof window === "undefined") return CANONICAL_ORIGIN;
  const host = window.location.hostname;
  if (host.endsWith(".grok.me") || host === "localhost" || host === "127.0.0.1") {
    return window.location.origin;
  }
  return CANONICAL_ORIGIN;
}

export function glyphShareUrl(token: string) {
  return `${publicOrigin()}/?o=${encodeURIComponent(token)}&ar=1`;
}

/** Ivory plate, black modules, heavy frame — maze-like, still a QR. */
export async function renderGlyphPlate(href: string, size = 1024): Promise<Blob> {
  const qr = encode(href, { ecc: "H", border: 2, boostEcc: true });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the glyph.");
  const paper = "#f4efe4";
  const ink = "#111111";
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, size, size);
  const frame = Math.round(size * 0.055);
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
      roundRect(ctx, x0 + x * cell, y0 + y * cell, cell * 0.94, cell * 0.94, cell * 0.18);
      ctx.fill();
    }
  }
  return blobFrom(canvas);
}

/**
 * The still they tuned, forced into a scannable QR.
 * Finder patterns stay crisp; the living field paints the data modules.
 * Phone Camera reads it as a MORPHOS URL.
 */
export async function renderSticker(field: Blob, href: string, size = 2048): Promise<Blob> {
  const img = await imageFromBlob(field);
  const qr = encode(href, { ecc: "H", border: 1, boostEcc: true });
  const src = document.createElement("canvas");
  src.width = size;
  src.height = size;
  const sctx = src.getContext("2d");
  if (!sctx) throw new Error("Could not sample the field.");
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  cover(sctx, img, size, size);
  const sample = sctx.getImageData(0, 0, size, size).data;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the sticker.");
  const paper = "#f4efe4";
  const ink = "#111111";
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, size, size);
  const frame = Math.round(size * 0.048);
  ctx.fillStyle = paper;
  ctx.fillRect(frame, frame, size - frame * 2, size - frame * 2);
  const inner = size - frame * 2;
  const pad = inner * 0.045;
  const fieldBox = inner - pad * 2;
  const cell = fieldBox / qr.size;
  const x0 = frame + pad;
  const y0 = frame + pad;
  ctx.drawImage(src, x0, y0, fieldBox, fieldBox);

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      const kind = qr.types[y]?.[x] ?? QrCodeDataType.Data;
      const bit = Boolean(qr.data[y]?.[x]);
      const px = x0 + x * cell;
      const py = y0 + y * cell;
      const functional =
        kind === QrCodeDataType.Position ||
        kind === QrCodeDataType.Alignment ||
        kind === QrCodeDataType.Timing ||
        kind === QrCodeDataType.Function;
      if (kind === QrCodeDataType.Border) continue;
      if (functional) {
        ctx.fillStyle = bit ? ink : paper;
        ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
        continue;
      }
      const u = (x + 0.5) / qr.size;
      const vv = (y + 0.5) / qr.size;
      const sx = Math.min(size - 1, Math.max(0, Math.floor(u * size)));
      const sy = Math.min(size - 1, Math.max(0, Math.floor(vv * size)));
      const i = (sy * size + sx) * 4;
      const lum = (0.2126 * (sample[i] ?? 0) + 0.7152 * (sample[i + 1] ?? 0) + 0.0722 * (sample[i + 2] ?? 0)) / 255;
      const target = bit ? 0.1 : 0.9;
      const mixed = lum * 0.22 + target * 0.78;
      const g8 = Math.round(mixed * 255);
      ctx.fillStyle = `rgb(${g8},${g8},${Math.round(g8 * 0.96)})`;
      roundRect(ctx, px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.16);
      ctx.fill();
    }
  }
  return blobFrom(canvas);
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the field."));
    img.src = url;
  });
}

function blobFrom(canvas: HTMLCanvasElement): Promise<Blob> {
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
  const Detector = (
    window as unknown as {
      BarcodeDetector?: new (o: { formats: string[] }) => {
        detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
      };
    }
  ).BarcodeDetector;
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
