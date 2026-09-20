export type Pt = { x: number; y: number };

/** 3×3 homography mapping src quad → dest quad (h8 = 1). */
export function homography(src: [Pt, Pt, Pt, Pt], dest: [Pt, Pt, Pt, Pt]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const u = dest[i]!.x;
    const v = dest[i]!.y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  h.push(1);
  return h;
}

/** CSS matrix3d that maps a w×h element onto dest (TL, TR, BR, BL). */
export function quadMatrix3d(w: number, h: number, dest: [Pt, Pt, Pt, Pt]): string {
  const src: [Pt, Pt, Pt, Pt] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const m = homography(src, dest);
  const t = [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, m[8]].map((n) => round(n ?? 0));
  return `matrix3d(${t.join(",")})`;
}

export function lerpQuad(a: [Pt, Pt, Pt, Pt], b: [Pt, Pt, Pt, Pt], t: number): [Pt, Pt, Pt, Pt] {
  return [
    { x: a[0].x + (b[0].x - a[0].x) * t, y: a[0].y + (b[0].y - a[0].y) * t },
    { x: a[1].x + (b[1].x - a[1].x) * t, y: a[1].y + (b[1].y - a[1].y) * t },
    { x: a[2].x + (b[2].x - a[2].x) * t, y: a[2].y + (b[2].y - a[2].y) * t },
    { x: a[3].x + (b[3].x - a[3].x) * t, y: a[3].y + (b[3].y - a[3].y) * t },
  ];
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    const tmp = M[col]!;
    M[col] = M[pivot]!;
    M[pivot] = tmp;
    const diag = M[col]![col]!;
    if (Math.abs(diag) < 1e-12) continue;
    for (let c = col; c <= n; c++) M[col]![c]! /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}
