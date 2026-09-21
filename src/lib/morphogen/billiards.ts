/** Outer billiards on the scale polygon. The mode is the table. */

export type Vec = { x: number; y: number };

/** Regular n-gon radius in plane coords (glass maps to [-1,1]²). */
export const TABLE_R = 0.28;

export function glassToPlane(nx: number, ny: number): Vec {
  return { x: (nx - 0.5) * 2, y: (0.5 - ny) * 2 };
}

export function vertex(k: number, n: number, rot: number, radius = TABLE_R): Vec {
  const m = Math.max(3, n);
  const a = rot + ((k % m) / m) * Math.PI * 2;
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}

export function apothem(n: number, radius = TABLE_R) {
  return radius * Math.cos(Math.PI / Math.max(3, n));
}

export function insideTable(p: Vec, n: number) {
  return Math.hypot(p.x, p.y) < apothem(n) * 0.98;
}

function isRightTangent(p: Vec, v: Vec, n: number, rot: number) {
  const vx = v.x - p.x;
  const vy = v.y - p.y;
  for (let k = 0; k < n; k++) {
    const w = vertex(k, n, rot);
    const c = vx * (w.y - p.y) - vy * (w.x - p.x);
    if (c < -1e-7) return false;
  }
  return true;
}

/** Reflect p through the right-supporting vertex. graze = singularity (an edge). */
export function outerReflect(p: Vec, n: number, rot: number): { q: Vec; k: number; graze: boolean } {
  const hits: number[] = [];
  for (let k = 0; k < n; k++) {
    if (isRightTangent(p, vertex(k, n, rot), n, rot)) hits.push(k);
  }
  const graze = hits.length !== 1;
  const k = hits[0] ?? 0;
  const v = vertex(k, n, rot);
  return { q: { x: 2 * v.x - p.x, y: 2 * v.y - p.y }, k, graze };
}

/**
 * Ring class of a starting point. Interior is period 1 (a hold).
 * Outer rings are n, 2n, 4n… — self-similar islands, as in the pentagon.
 */
export function islandPeriod(p: Vec, n: number): number {
  const r = Math.hypot(p.x, p.y);
  const ap = apothem(n);
  if (r < ap) return 1;
  const ring = Math.min(3, Math.floor((r - ap) / 0.18));
  return n * (1 << ring);
}

/** Table spin: compass if live, otherwise a slow roll. */
export function tableRot(heading: number, roll: number, compass: boolean) {
  if (compass) return ((heading % 360) / 360) * Math.PI * 2;
  return roll * 0.55;
}

export function nearestDegree(p: Vec, n: number, rot: number) {
  const ang = Math.atan2(p.y, p.x) - rot;
  const tau = Math.PI * 2;
  const u = ((ang % tau) + tau) % tau;
  return Math.round((u / tau) * n) % n;
}
