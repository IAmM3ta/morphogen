/**
 * Gray–Scott pattern regimes (feed, kill) in the MORPHOS convention
 * (du≈0.21, dv≈0.105, 9-point Laplacian as in Karl Sims' tutorial:
 * centre −1, edges .2, diagonals .05). The style map blends the species
 * regime with a second regime that drifts through this list.
 */
export type Regime = { id: string; name: string; feed: number; kill: number };

export const REGIMES: Regime[] = [
  { id: "spots", name: "Spots", feed: 0.0353, kill: 0.0653 },
  { id: "mitosis", name: "Mitosis", feed: 0.0367, kill: 0.0649 },
  { id: "stripes", name: "Stripes", feed: 0.026, kill: 0.061 },
  { id: "labyrinth", name: "Labyrinth", feed: 0.029, kill: 0.057 },
  { id: "coral", name: "Coral", feed: 0.0545, kill: 0.062 },
  { id: "worms", name: "Worms", feed: 0.046, kill: 0.063 },
  { id: "holes", name: "Holes", feed: 0.039, kill: 0.058 },
  { id: "waves", name: "Waves", feed: 0.018, kill: 0.051 },
];

/** Smoothly drifting regime: crossfades neighbours over `period` seconds. */
export class RegimeDrift {
  private phase = Math.random() * REGIMES.length;
  feed = REGIMES[0]!.feed;
  kill = REGIMES[0]!.kill;
  name = REGIMES[0]!.name;

  tick(dt: number, period: number, bias: number) {
    this.phase = (this.phase + dt / Math.max(4, period)) % REGIMES.length;
    const p = (this.phase + bias * 2) % REGIMES.length;
    const i = Math.floor(p);
    const f = p - i;
    const s = f < 0.7 ? 0 : (f - 0.7) / 0.3; // hold, then glide
    const g = s * s * (3 - 2 * s);
    const a = REGIMES[i]!;
    const b = REGIMES[(i + 1) % REGIMES.length]!;
    this.feed = a.feed + (b.feed - a.feed) * g;
    this.kill = a.kill + (b.kill - a.kill) * g;
    this.name = g < 0.5 ? a.name : b.name;
  }
}
