/**
 * Signal conditioning for hands and sensors.
 *
 * The One Euro filter (Casiez, Roussel & Vogel, CHI 2012) is a low-pass whose
 * cutoff rises with speed: slow movements are steady, fast movements keep
 * little lag. It is the standard choice for noisy human input such as
 * gyroscopes and touch.
 */

function smoothingAlpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(1e-4, cutoffHz));
  return 1 / (1 + tau / Math.max(1e-5, dt));
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private last = 0;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.02,
    public dCutoff = 1.0,
  ) {}

  reset(value?: number) {
    this.x = value ?? null;
    this.dx = 0;
    this.last = 0;
  }

  get value(): number {
    return this.x ?? 0;
  }

  /** `t` in seconds (monotonic). */
  filter(value: number, t: number): number {
    if (!Number.isFinite(value)) return this.value;
    if (this.x === null || this.last === 0) {
      this.x = value;
      this.last = t;
      return value;
    }
    const dt = Math.max(1e-4, Math.min(0.25, t - this.last));
    this.last = t;
    const rawDx = (value - this.x) / dt;
    const aD = smoothingAlpha(this.dCutoff, dt);
    this.dx = this.dx + aD * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = smoothingAlpha(cutoff, dt);
    this.x = this.x + a * (value - this.x);
    return this.x;
  }
}

/** Frame-rate independent exponential approach. `tau` in seconds. */
export function approach(prev: number, next: number, dt: number, tau: number): number {
  if (!Number.isFinite(next)) return prev;
  if (tau <= 0) return next;
  return prev + (next - prev) * (1 - Math.exp(-Math.max(0, dt) / tau));
}

/** Asymmetric envelope follower: fast attack, slow release. */
export function follow(prev: number, next: number, dt: number, attack: number, release: number): number {
  return approach(prev, next, dt, next > prev ? attack : release);
}

/** Unwraps a compass heading (deg) so filters never jump across 0/360. */
export class AngleUnwrap {
  private prev: number | null = null;
  private acc = 0;
  push(deg: number): number {
    if (!Number.isFinite(deg)) return this.acc;
    if (this.prev === null) {
      this.prev = deg;
      this.acc = deg;
      return deg;
    }
    let d = deg - this.prev;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    this.prev = deg;
    this.acc += d;
    return this.acc;
  }
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
