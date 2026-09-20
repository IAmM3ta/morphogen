import type { Artist, Origin } from "./origin";
import { encodeGlyphToken, originToGlyph, renderSticker, glyphShareUrl } from "./glyph";

export type Track = {
  id: string;
  title: string;
  origin: Origin;
  url: string;
};

export function creditsFrom(visual: Artist, audio: Artist): { visual: Artist; audio: Artist } {
  return { visual, audio };
}

/** Ivory sleeve: release title, both credits, ordered glyph plates. */
export async function renderSleeve(opts: {
  title: string;
  visual: string;
  audio: string;
  plates: { png: Blob; title: string }[];
}): Promise<Blob> {
  const n = Math.max(1, opts.plates.length);
  const cols = n <= 2 ? n : n <= 6 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cell = 640;
  const gap = 28;
  const top = 200;
  const side = 48;
  const bottom = 72;
  const w = side * 2 + cols * cell + (cols - 1) * gap;
  const h = top + rows * cell + (rows - 1) * gap + bottom;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not open the sleeve.");
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#111111";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  ctx.font = "600 42px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(opts.title.slice(0, 42) || "UNTITLED RELEASE", w / 2, 88);
  ctx.font = "500 18px ui-monospace, monospace";
  ctx.fillStyle = "#3a3a3a";
  const vis = opts.visual || "visual";
  const aud = opts.audio || "audio";
  ctx.fillText(vis === aud ? vis : `${vis}  ·  ${aud}`, w / 2, 128);
  ctx.font = "500 13px ui-monospace, monospace";
  ctx.fillText("MORPHOS  ·  LIVING FIELD  ·  SCAN ANY PLATE", w / 2, 158);

  for (let i = 0; i < opts.plates.length; i++) {
    const plate = opts.plates[i]!;
    const img = await blobImage(plate.png);
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = side + c * (cell + gap);
    const y = top + r * (cell + gap);
    ctx.drawImage(img, x, y, cell, cell - 36);
    ctx.fillStyle = "#111111";
    ctx.font = "500 16px ui-monospace, monospace";
    ctx.textAlign = "center";
    const label = `${String(i + 1).padStart(2, "0")}  ${plate.title || "untitled"}`;
    ctx.fillText(label.slice(0, 36), x + cell / 2, y + cell - 8);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not print the sleeve."));
    }, "image/png");
  });
}

export async function stickerForTrack(shotUrl: string, origin: Origin): Promise<Blob> {
  const src = await fetch(shotUrl).then((r) => r.blob());
  const token = encodeGlyphToken(originToGlyph(origin, origin.artist, origin.audio));
  return renderSticker(src, glyphShareUrl(token));
}

function blobImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read a plate."));
    img.src = url;
  });
}
