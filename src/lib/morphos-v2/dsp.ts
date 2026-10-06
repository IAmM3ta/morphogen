/** Small Web Audio building blocks shared by the v2 voices. */

export function setTarget(param: AudioParam, value: number, time: number, tau: number) {
  if (!Number.isFinite(value) || !Number.isFinite(time)) return;
  try {
    param.setTargetAtTime(value, Math.max(0, time), Math.max(0.001, tau));
  } catch {
    /* never throw from audio scheduling */
  }
}

export function setNow(param: AudioParam, value: number, time: number) {
  if (!Number.isFinite(value)) return;
  try {
    param.cancelScheduledValues(time);
    param.setValueAtTime(value, time);
  } catch {
    /* ignore */
  }
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const hit = noiseCache.get(ctx);
  if (hit) return hit;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = 12345 + c * 777;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }
  }
  noiseCache.set(ctx, buf);
  return buf;
}

/** Stereo, exponentially decaying noise impulse with a slightly darker tail. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 4.2, decay = 2.6): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    let seed = 999 + c * 31337;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = (seed / 4294967296) * 2 - 1;
      const t = i / len;
      // One-pole low-pass whose cutoff falls over the tail: highs die first.
      const k = 0.55 - 0.45 * t;
      lp += (n - lp) * k;
      const pre = i < sr * 0.012 ? i / (sr * 0.012) : 1;
      d[i] = lp * Math.pow(1 - t, decay) * pre * 0.9;
    }
  }
  return buf;
}

/** Transparent below `knee`, smooth tanh shoulder above, ceiling at 1. */
export function softClipCurve(knee = 0.8, n = 2048): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** Warm saturation for bass mid layers. `drive` ≥ 1. */
export function saturateCurve(drive = 3, n = 2048): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // Asymmetric bias adds a little even harmonic.
    c[i] = Math.tanh(drive * (x + 0.08 * x * x)) / norm;
  }
  return c;
}

/** Wavetables for the drone morph: soft → glass → vox → buzz. */
export function droneTables(ctx: BaseAudioContext): PeriodicWave[] {
  const n = 40;
  const make = (fn: (k: number) => number) => {
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = fn(k);
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  };
  const formant = (k: number, centers: number[], width: number) =>
    centers.reduce((s, c) => s + Math.exp(-((k - c) * (k - c)) / (2 * width * width)), 0);
  return [
    make((k) => (k === 1 ? 1 : k === 2 ? 0.18 : k === 3 ? 0.06 : 0)),
    make((k) => (k % 2 === 1 ? 1 / Math.pow(k, 1.1) : 0.35 / Math.pow(k, 1.6))),
    make((k) => (0.25 / k + formant(k, [3, 7, 11], 1.3) * 0.6) * (k > 24 ? 0.3 : 1)),
    make((k) => 1 / Math.pow(k, 0.85)),
  ];
}

/** Granular pitch-up shimmer as an AudioWorklet (registered once per context). */
export const SHIMMER_WORKLET = `
class MorphosShimmer extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitch', defaultValue: 2, minValue: 0.25, maxValue: 4 },
      { name: 'density', defaultValue: 0.5, minValue: 0, maxValue: 1 },
    ];
  }
  constructor() {
    super();
    this.size = Math.floor(sampleRate * 1.5);
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.w = 0;
    this.grains = [];
    this.next = 0;
    this.seed = 1;
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  process(inputs, outputs, params) {
    const inp = inputs[0] || [];
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    const pitch = params.pitch[0];
    const density = params.density[0];
    const len = Math.floor((0.07 + 0.09 * (1 - density)) * sampleRate);
    const size = this.size;
    for (let i = 0; i < n; i++) {
      const a = inp[0] ? inp[0][i] : 0;
      const b = inp[1] ? inp[1][i] : a;
      this.buf[0][this.w] = a;
      this.buf[1][this.w] = b;
      this.w = (this.w + 1) % size;
      if (--this.next <= 0 && this.grains.length < 14) {
        const lag = Math.max(0, (pitch - 1)) * len + 64 + this.rnd() * 0.04 * sampleRate;
        const start = (this.w - lag + size * 4) % size;
        const pan = this.rnd();
        this.grains.push({ pos: start, age: 0, len, gl: Math.cos(pan * 1.5708), gr: Math.sin(pan * 1.5708) });
        this.next = Math.max(32, Math.floor(len / (1.5 + density * 4)));
      }
      let l = 0, r = 0;
      for (let g = this.grains.length - 1; g >= 0; g--) {
        const gr = this.grains[g];
        const p = gr.pos + gr.age * pitch;
        const i0 = Math.floor(p) % size;
        const i1 = (i0 + 1) % size;
        const fr = p - Math.floor(p);
        const ph = gr.age / gr.len;
        const win = Math.sin(Math.PI * ph);
        const w2 = win * win;
        const sl = this.buf[0][i0] * (1 - fr) + this.buf[0][i1] * fr;
        const sr = this.buf[1][i0] * (1 - fr) + this.buf[1][i1] * fr;
        l += sl * w2 * gr.gl;
        r += sr * w2 * gr.gr;
        gr.age++;
        if (gr.age >= gr.len) this.grains.splice(g, 1);
      }
      L[i] = l * 0.45;
      R[i] = r * 0.45;
    }
    return true;
  }
}
registerProcessor('morphos-shimmer', MorphosShimmer);
`;

const workletReady = new WeakMap<BaseAudioContext, Promise<boolean>>();

export function ensureShimmerWorklet(ctx: BaseAudioContext): Promise<boolean> {
  const hit = workletReady.get(ctx);
  if (hit) return hit;
  const p = (async () => {
    try {
      if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") return false;
      const url = URL.createObjectURL(new Blob([SHIMMER_WORKLET], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      return true;
    } catch {
      return false;
    }
  })();
  workletReady.set(ctx, p);
  return p;
}
