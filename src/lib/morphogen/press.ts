import type { Origin } from "./origin";
import { originStamp } from "./origin";
import { encodeGlyphToken, glyphShareUrl, originToGlyph, renderSticker } from "./glyph";

export type PressMode = "none" | "mirror-x" | "kaleido";

/** Scale and optionally mirror/tile a field still for print or a loop pack. */
export async function pressImage(src: Blob, mode: PressMode, size = 2048): Promise<Blob> {
  const bmp = await blobToImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not open the press.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (mode === "none") {
    cover(ctx, bmp, size, size);
  } else if (mode === "mirror-x") {
    const half = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, half, size);
    ctx.clip();
    cover(ctx, bmp, half, size);
    ctx.restore();
    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.rect(0, 0, half, size);
    ctx.clip();
    cover(ctx, bmp, half, size);
    ctx.restore();
  } else {
    const q = size / 2;
    const cells: Array<[number, number, number, number]> = [
      [0, 0, 1, 1],
      [q, 0, -1, 1],
      [0, q, 1, -1],
      [q, q, -1, -1],
    ];
    for (const [x, y, sx, sy] of cells) {
      ctx.save();
      ctx.translate(sx < 0 ? x + q : x, sy < 0 ? y + q : y);
      ctx.scale(sx, sy);
      ctx.beginPath();
      ctx.rect(0, 0, q, q);
      ctx.clip();
      cover(ctx, bmp, q, q);
      ctx.restore();
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not print the field."));
    }, "image/png");
  });
}

export async function packEdition(png: Blob, origin: Origin, mode: PressMode): Promise<Blob> {
  const stamp = originStamp(origin.capturedAt);
  const folder = `MORPHOS-${stamp}`;
  const token = encodeGlyphToken(originToGlyph(origin, origin.artist, origin.audio));
  const href = glyphShareUrl(token);
  const glyph = await renderSticker(png, href);
  const readme = packReadme(origin, mode);
  const originBytes = new TextEncoder().encode(`${JSON.stringify(origin, null, 2)}\n`);
  const note = new TextEncoder().encode(readme);
  const pngBytes = new Uint8Array(await png.arrayBuffer());
  const glyphBytes = new Uint8Array(await glyph.arrayBuffer());
  return zipStore([
    { path: `${folder}/field.png`, data: pngBytes },
    { path: `${folder}/glyph.png`, data: glyphBytes },
    { path: `${folder}/origin.json`, data: originBytes },
    { path: `${folder}/ATELIER.txt`, data: note },
  ]);
}

function packReadme(origin: Origin, mode: PressMode) {
  return [
    "MORPHOS — Living Field  ·  edition pack",
    "",
    `Captured  ${origin.capturedAt}`,
    `Kind      ${origin.kind}`,
    `Press     ${mode}`,
    `Chemistry F=${origin.chemistry.feed}  k=${origin.chemistry.kill}  Du=${origin.chemistry.du}  Dv=${origin.chemistry.dv}`,
    `Voice     ${origin.voice.keyId} ${origin.voice.modeId}  ${origin.voice.waveform}`,
    `Pose      roll ${origin.pose.roll}  pitch ${origin.pose.pitch}  heading ${origin.pose.heading}`,
    "",
    "Resolume",
    "  Drop field.png (or the session .webm) on a clip. Loop. Premultiply off.",
    "  origin.json is the certificate — keep it next to the clip.",
    "",
    "TouchDesigner",
    "  Movie File In TOP ← field.png. Table DAT ← origin.json.",
    "  The instrument already speaks WebSocket (Sync). This pack is the still edition.",
    "",
    "Sticker",
    "  glyph.png is the print. It is their field, forced into a QR the phone Camera",
    "  already knows how to read. The URL is MORPHOS with the origin in ?o=",
    "  No app: the link is the instrument. Installed PWA: it opens in MORPHOS.",
    "  Native App Store / Play wrap can keep this same URL (Universal Links).",
    "",
    "Print",
    "  field.png is 2048², sRGB. Book-match and kaleido are optional presses.",
    "  Send glyph.png to the sticker shop. Hang it at the venue.",
    "",
    "The pattern cannot be remade. The seed was this body, this room, this minute.",
    "",
  ].join("\n");
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | ImageBitmap, w: number, h: number) {
  const iw = "width" in img ? img.width : 1;
  const ih = "height" in img ? img.height : 1;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read the still."));
    img.src = url;
  });
  return img;
}

function crc32(buf: Uint8Array) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

/** Uncompressed zip. Enough for an edition pack in the browser. */
export function zipStore(files: { path: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.path);
    const crc = crc32(file.data);
    const size = file.data.length;
    const local = concat(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
      file.data,
    );
    const central = concat(
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    );
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const central = concat(...centrals);
  const end = concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0));
  return new Blob([concat(...locals, central, end)], { type: "application/zip" });
}

function concat(...parts: Uint8Array[]) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
