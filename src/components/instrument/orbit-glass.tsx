import { TABLE_R, vertex } from "@/lib/morphogen/billiards";

/** The scale polygon, faintly — so the table is visible while you play. */
export function OrbitGlass({
  n,
  rot,
  degrees,
}: {
  n: number;
  rot: number;
  degrees: number[];
}) {
  const sides = Math.max(3, n);
  const active = new Set(degrees);
  const r = 42;
  const cx = 50;
  const cy = 50;
  const pts = Array.from({ length: sides }, (_, k) => {
    const v = vertex(k, sides, rot, TABLE_R);
    return `${(cx + v.x * r).toFixed(1)},${(cy - v.y * r).toFixed(1)}`;
  }).join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 z-[8] h-full w-full opacity-45 mix-blend-screen"
      aria-hidden
    >
      <polygon points={pts} fill="none" stroke="rgba(236,230,216,0.3)" strokeWidth="0.35" />
      {Array.from({ length: sides }, (_, k) => {
        const v = vertex(k, sides, rot, TABLE_R);
        const on = active.has(k);
        return (
          <circle
            key={k}
            cx={cx + v.x * r}
            cy={cy - v.y * r}
            r={on ? 1.6 : 0.7}
            fill={on ? "rgba(236,230,216,0.92)" : "rgba(236,230,216,0.32)"}
          />
        );
      })}
    </svg>
  );
}
