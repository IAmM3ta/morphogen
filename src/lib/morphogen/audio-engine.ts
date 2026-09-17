import { runtime } from "./runtime";
import { DEFAULT_WAVEFORM, type Brush, type WaveformId } from "./presets";

function ramp(param: AudioParam, value: number, now: number, t = 0.05) {
  param.setTargetAtTime(value, now, t);
}

/** Live voice interval above frozen layers: unison, fifth, octave, fourth. */
const LIVE_INTERVAL = [1, 1.5, 2, 4 / 3, 5 / 4];

/**
 * Earth-ionosphere cavity fundamental (Schumann).
 * Audible "Hum" body lives on ×4 / ×8; phones hear ×16 / ×32.
 */
export const SCHUMANN = 7.83;

/** Cavity modes plus the colloquial Hum octaves. All ratios of 7.83 Hz. */
const HUM_PARTIALS: { hz: number; amp: number }[] = [
  { hz: 7.83, amp: 0.018 },
  { hz: 14.3, amp: 0.022 },
  { hz: 20.8, amp: 0.024 },
  { hz: 27.3, amp: 0.028 },
  { hz: 31.32, amp: 0.12 },
  { hz: 31.38, amp: 0.07 },
  { hz: 33.8, amp: 0.02 },
  { hz: 39.3, amp: 0.018 },
  { hz: 62.64, amp: 0.09 },
  { hz: 125.28, amp: 0.045 },
  { hz: 250.56, amp: 0.02 },
];

function yToHz(y: number, pitchTilt: number): number {
  const ny = Math.max(0, Math.min(1, 1 - y + pitchTilt * 0.06));
  return SCHUMANN * (8 + ny * 64);
}

function snapHz(hz: number, amount: number): number {
  const n = Math.max(4, Math.round(hz / SCHUMANN));
  const snapped = SCHUMANN * n;
  return hz * (1 - amount) + snapped * amount;
}

function pulseWave(ctx: AudioContext, duty = 0.22, n = 64): PeriodicWave {
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  real[0] = 2 * duty - 1;
  for (let k = 1; k < n; k++) {
    imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

function spectrumWave(ctx: AudioContext, grid: Float32Array, energy: number, edge: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    const gi = Math.min(255, Math.floor((k / (n - 1)) * 255));
    const g = grid[gi] ?? 0;
    const odd = k % 2 === 1 ? 1 : 0.4 + edge * 0.5;
    imag[k] = (0.1 + g * 1.35) * (1 / Math.pow(k, 0.72)) * odd * (0.4 + energy);
  }
  return ctx.createPeriodicWave(real, imag);
}

const LOUD: Record<WaveformId, number> = {
  sine: 0.86,
  triangle: 0.92,
  sawtooth: 0.55,
  square: 0.48,
  pulse: 0.52,
  spectrum: 0.72,
};

const CUT: Record<WaveformId, number> = {
  sine: 0.82,
  triangle: 1,
  sawtooth: 0.62,
  square: 0.55,
  pulse: 0.6,
  spectrum: 0.86,
};

function applyOscShape(osc: OscillatorNode, wave: WaveformId, pulse: PeriodicWave | null, spec: PeriodicWave | null) {
  if (wave === "pulse" && pulse) osc.setPeriodicWave(pulse);
  else if (wave === "spectrum" && spec) osc.setPeriodicWave(spec);
  else if (wave === "sine" || wave === "triangle" || wave === "sawtooth" || wave === "square") osc.type = wave;
  else osc.type = "sine";
}

type HumPartial = {
  osc: OscillatorNode;
  gain: GainNode;
  hz: number;
  amp: number;
};

type LiveVoice = {
  id: number;
  osc: OscillatorNode;
  detune: OscillatorNode;
  harm: OscillatorNode;
  sub: OscillatorNode;
  fm: OscillatorNode;
  fmGain: GainNode;
  oscG: GainNode;
  detG: GainNode;
  harmG: GainNode;
  subG: GainNode;
  mix: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  gate: GainNode;
  wave: WaveformId;
};

type FrozenVoice = {
  osc: OscillatorNode[];
  noise: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  delay: DelayNode;
  fb: GainNode;
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private tiltFilter: BiquadFilterNode | null = null;
  private hum: HumPartial[] = [];
  private humBus: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  private echo: DelayNode | null = null;
  private echoGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private fft = new Float32Array(64);
  private frozen: FrozenVoice[] = [];
  private live = new Map<number, LiveVoice>();
  private liveMul = 1;
  private noiseBuf: AudioBuffer | null = null;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private pulse: PeriodicWave | null = null;
  private spec: PeriodicWave | null = null;
  private specTick = 0;
  volume = 0.7;
  muted = false;
  enabled = false;
  lastHz = 0;
  voiceCount = 0;

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.buildGraph();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.enabled = true;
  }

  private buildGraph() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.tiltFilter = ctx.createBiquadFilter();
    this.tiltFilter.type = "lowpass";
    this.tiltFilter.frequency.value = 1800;
    this.tiltFilter.Q.value = 0.7;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.16;

    this.delay = ctx.createDelay(1.4);
    this.delay.delayTime.value = 0.42;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.22;
    this.echo = ctx.createDelay(0.4);
    this.echo.delayTime.value = 0.14;
    this.echoGain = ctx.createGain();
    this.echoGain.gain.value = 0.1;

    this.bus.connect(this.tiltFilter);
    this.tiltFilter.connect(this.delay);
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.tiltFilter);
    this.tiltFilter.connect(this.echo);
    this.echo.connect(this.echoGain);
    this.echoGain.connect(this.tiltFilter);
    this.tiltFilter.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);
    this.capture = ctx.createMediaStreamDestination();
    this.master.connect(this.capture);

    this.humBus = ctx.createGain();
    this.humBus.gain.value = 0;
    this.humBus.connect(this.bus);
    this.hum = HUM_PARTIALS.map((p) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = p.hz;
      const gain = ctx.createGain();
      gain.gain.value = p.amp;
      osc.connect(gain);
      gain.connect(this.humBus!);
      osc.start();
      return { osc, gain, hz: p.hz, amp: p.amp };
    });

    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.11;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.012;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.humBus.gain);
    this.lfo.start();

    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = n.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuf = n;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = n;
    this.noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "lowpass";
    this.noiseFilter.frequency.value = 160;
    this.noiseFilter.Q.value = 0.5;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.bus);
    this.noise.start();

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;

    try {
      this.pulse = pulseWave(ctx);
    } catch {
      this.pulse = null;
    }
    try {
      this.spec = spectrumWave(ctx, runtime.stats.grid, 0.2, 0.1);
    } catch {
      this.spec = null;
    }

    ramp(this.master.gain, this.muted ? 0 : this.volume * this.volume, ctx.currentTime, 0.08);
    ramp(this.humBus.gain, 0.72, ctx.currentTime, 0.4);
  }

  captureStream(): MediaStream | null {
    return this.capture?.stream ?? null;
  }

  setVolume(v: number) {
    this.volume = v;
    if (!this.ctx || !this.master) return;
    ramp(this.master.gain, this.muted || !this.enabled ? 0 : v * v, this.ctx.currentTime, 0.04);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.setVolume(this.volume);
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  async connectMic(): Promise<boolean> {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || !this.analyser) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      this.micSource = ctx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.analyser);
      return true;
    } catch {
      return false;
    }
  }

  stopMic() {
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  readMic(): { rms: number; bass: number; mid: number; high: number; centroid: number } {
    const empty = { rms: 0, bass: 0, mid: 0, high: 0, centroid: 0 };
    if (!this.analyser) return empty;
    this.analyser.getFloatFrequencyData(this.fft);
    let sum = 0;
    let bass = 0;
    let mid = 0;
    let high = 0;
    let weighted = 0;
    let magSum = 0;
    const n = this.fft.length;
    for (let i = 0; i < n; i++) {
      const mag = Math.min(1, Math.max(0, (this.fft[i]! + 90) / 70));
      sum += mag;
      if (i < n * 0.15) bass += mag;
      else if (i < n * 0.45) mid += mag;
      else high += mag;
      weighted += mag * i;
      magSum += mag;
    }
    const rms = sum / n;
    runtime.mic = rms;
    return {
      rms,
      bass: bass / Math.max(1, n * 0.15),
      mid: mid / Math.max(1, n * 0.3),
      high: high / Math.max(1, n * 0.55),
      centroid: magSum > 1e-5 ? weighted / magSum / n : 0.3,
    };
  }

  private applyWave(v: LiveVoice, wave: WaveformId) {
    applyOscShape(v.osc, wave, this.pulse, this.spec);
    const detWave = wave === "triangle" ? "triangle" : "sine";
    applyOscShape(v.detune, detWave, this.pulse, this.spec);
    v.harm.type = "sine";
    v.wave = wave;
    const now = this.ctx?.currentTime ?? 0;
    const oscMix = wave === "sawtooth" || wave === "square" || wave === "pulse" ? 0.34 : 0.4;
    const detMix = wave === "sine" ? 0.22 : wave === "triangle" ? 0.28 : 0.12;
    const harmMix = wave === "sine" ? 0.06 : wave === "spectrum" ? 0.08 : 0.05;
    ramp(v.oscG.gain, oscMix, now, 0.04);
    ramp(v.detG.gain, detMix, now, 0.04);
    ramp(v.harmG.gain, harmMix, now, 0.04);
  }

  setWaveform(id: WaveformId) {
    runtime.waveform = id;
    for (const v of this.live.values()) this.applyWave(v, id);
  }

  private allocVoice(id: number): LiveVoice {
    const ctx = this.ctx!;
    const mix = ctx.createGain();
    mix.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.75;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    const gate = ctx.createGain();
    gate.gain.value = 1;
    mix.connect(filter);
    filter.connect(pan);
    pan.connect(gate);
    gate.connect(this.bus!);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = SCHUMANN * 16;
    const oscG = ctx.createGain();
    oscG.gain.value = 0.4;
    osc.connect(oscG);
    oscG.connect(mix);

    const detune = ctx.createOscillator();
    detune.type = "sine";
    detune.frequency.value = SCHUMANN * 16 * 1.003;
    const detG = ctx.createGain();
    detG.gain.value = 0.22;
    detune.connect(detG);
    detG.connect(mix);

    const harm = ctx.createOscillator();
    harm.type = "sine";
    harm.frequency.value = SCHUMANN * 32;
    const harmG = ctx.createGain();
    harmG.gain.value = 0.06;
    harm.connect(harmG);
    harmG.connect(mix);

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = SCHUMANN * 8;
    const subG = ctx.createGain();
    subG.gain.value = 0.18;
    sub.connect(subG);
    subG.connect(mix);

    const fm = ctx.createOscillator();
    fm.type = "sine";
    fm.frequency.value = SCHUMANN;
    const fmGain = ctx.createGain();
    fmGain.gain.value = 0;
    fm.connect(fmGain);
    fmGain.connect(osc.frequency);
    fmGain.connect(detune.frequency);

    osc.start();
    detune.start();
    harm.start();
    sub.start();
    fm.start();

    const v: LiveVoice = {
      id,
      osc,
      detune,
      harm,
      sub,
      fm,
      fmGain,
      oscG,
      detG,
      harmG,
      subG,
      mix,
      filter,
      pan,
      gate,
      wave: DEFAULT_WAVEFORM,
    };
    this.applyWave(v, runtime.waveform);
    this.live.set(id, v);
    return v;
  }

  private releaseLive(id: number) {
    const v = this.live.get(id);
    if (!v || !this.ctx) return;
    const now = this.ctx.currentTime;
    ramp(v.mix.gain, 0.0001, now, 0.04);
    const stopAt = now + 0.22;
    try {
      v.osc.stop(stopAt);
      v.detune.stop(stopAt);
      v.harm.stop(stopAt);
      v.sub.stop(stopAt);
      v.fm.stop(stopAt);
    } catch {
      /* already */
    }
    window.setTimeout(() => {
      try {
        v.mix.disconnect();
        v.filter.disconnect();
        v.pan.disconnect();
        v.gate.disconnect();
      } catch {
        /* gone */
      }
    }, 280);
    this.live.delete(id);
  }

  private driveVoice(v: LiveVoice, x: number, y: number, pressure: number, radius: number, now: number) {
    const wave = runtime.waveform;
    if (v.wave !== wave) this.applyWave(v, wave);
    const sense = runtime.sense;
    const gravity = wave === "sine" ? 0.48 : 0.28;
    const hz = snapHz(yToHz(y, sense.pitch), gravity) * this.liveMul;
    this.lastHz = hz;
    const amp =
      (0.1 + pressure * 0.55 + radius * 0.18) *
      (0.72 + Math.max(0, 1 - y) * 0.18) *
      (0.85 + sense.gforce * 0.04) *
      LOUD[wave];
    const cutoff =
      (520 + pressure * 1800 + (1 - y) * 700 + sense.pitch * 280 + runtime.stats.edge * 360) * CUT[wave];
    const vib = wave === "sine" ? SCHUMANN * (0.5 + sense.spin * 0.4) : 3.2 + sense.spin * 8 + Math.abs(sense.roll) * 2;
    const fmAmt = wave === "sine" ? 0.35 + sense.spin * 2.2 : 2 + sense.spin * 22 + pressure * 8 + runtime.mic * 18;

    ramp(v.osc.frequency, hz, now, 0.022);
    ramp(v.detune.frequency, hz * (1.002 + sense.roll * 0.004), now, 0.024);
    ramp(v.harm.frequency, Math.min(2400, hz * 2), now, 0.03);
    ramp(v.sub.frequency, snapHz(hz * 0.5, 0.6), now, 0.03);
    ramp(v.fm.frequency, vib, now, 0.05);
    ramp(v.fmGain.gain, fmAmt, now, 0.05);
    ramp(v.filter.frequency, Math.max(180, Math.min(5200, cutoff)), now, 0.04);
    ramp(v.pan.pan, Math.max(-0.9, Math.min(0.9, (x - 0.5) * 1.6 + sense.yaw * 0.15)), now, 0.04);
    ramp(v.mix.gain, Math.max(0.0001, Math.min(0.5, amp)), now, 0.03);
  }

  tick() {
    if (!this.enabled || !this.ctx || !this.humBus || !this.noiseFilter || !this.noiseGain || !this.tiltFilter || !this.delayGain)
      return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = runtime.stats;
    const energy = s.energy;
    const v = s.meanV;
    const edge = s.edge;
    const sense = runtime.sense;
    this.readMic();

    if (runtime.waveform === "spectrum") {
      this.specTick = (this.specTick + 1) % 8;
      if (this.specTick === 0) {
        this.spec = spectrumWave(ctx, s.grid, energy, edge);
        for (const voice of this.live.values()) {
          if (voice.wave === "spectrum") voice.osc.setPeriodicWave(this.spec);
        }
      }
    }

    const hands: Brush[] = runtime.brushes.slice();
    if (hands.length === 0 && runtime.antenna.on) {
      hands.push({
        id: -1,
        x: runtime.antenna.x,
        y: runtime.antenna.y,
        px: runtime.antenna.x,
        py: runtime.antenna.y,
        size: 0.04,
        strength: 0.4,
        pressure: runtime.antenna.pressure,
        radius: 0.4,
      });
    }

    const seen = new Set<number>();
    for (const b of hands) {
      seen.add(b.id);
      const voice = this.live.get(b.id) ?? this.allocVoice(b.id);
      this.driveVoice(voice, b.x, b.y, b.pressure, b.radius, now);
    }
    for (const id of [...this.live.keys()]) {
      if (!seen.has(id)) this.releaseLive(id);
    }
    this.voiceCount = this.live.size;

    const lead = this.live.size > 0 ? 0.62 : 1;
    const humLevel = (0.58 + energy * 0.22 + Math.abs(sense.pitch) * 0.04) * lead;
    ramp(this.humBus.gain, Math.max(0.28, Math.min(0.95, humLevel)), now, 0.18);

    const body = this.hum.find((p) => p.hz === 31.32);
    if (body) ramp(body.gain.gain, body.amp * (1 + energy * 0.35), now, 0.2);
    const octave = this.hum.find((p) => p.hz === 125.28);
    if (octave) ramp(octave.gain.gain, octave.amp * (1 + (1 - s.cy) * 0.4 + v * 0.3), now, 0.16);

    ramp(this.noiseFilter.frequency, 90 + edge * 220 + energy * 80 + sense.spin * 140, now, 0.1);
    ramp(this.noiseGain.gain, 0.008 + edge * 0.02 + runtime.mic * 0.04 + sense.spin * 0.015, now, 0.08);

    const tiltCut = 900 + energy * 900 + v * 280 + sense.pitch * 500 + this.live.size * 120;
    ramp(this.tiltFilter.frequency, Math.max(220, Math.min(4200, tiltCut)), now, 0.1);
    ramp(this.delayGain.gain, 0.16 + energy * 0.1 + Math.abs(sense.roll) * 0.06, now, 0.16);
    if (this.echoGain) ramp(this.echoGain.gain, 0.08 + sense.spin * 0.1, now, 0.12);
  }

  lockLoop(): number {
    if (!this.ctx || !this.master || !this.enabled) return this.frozen.length;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.frozen.length >= 4) this.releaseVoice(this.frozen.shift()!, now);

    const gain = ctx.createGain();
    const n = this.frozen.length + 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.04, 0.16 / n), now + 0.18);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.tiltFilter?.frequency.value ?? 1200;
    filter.Q.value = 0.7;

    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.64 + this.frozen.length * 0.12;
    const fb = ctx.createGain();
    fb.gain.value = 0.78;

    gain.connect(filter);
    filter.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    filter.connect(this.master);
    delay.connect(this.master);

    const root = snapHz(this.lastHz || SCHUMANN * 8, 1);
    const freqs = [root, root * 2, SCHUMANN * 8, SCHUMANN * 4];
    const osc: OscillatorNode[] = [];
    const wave = runtime.waveform;
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      applyOscShape(o, wave === "sine" ? "sine" : wave, this.pulse, this.spec);
      o.frequency.value = freqs[i]!;
      const og = ctx.createGain();
      og.gain.value = i < 2 ? 0.18 : 0.12;
      o.connect(og);
      og.connect(gain);
      o.start(now);
      osc.push(o);
    }

    const noise = ctx.createBufferSource();
    if (this.noiseBuf) noise.buffer = this.noiseBuf;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.03 + runtime.stats.edge * 0.04;
    noise.connect(ng);
    ng.connect(filter);
    noise.start(now);

    this.frozen.push({ osc, noise, gain, filter, delay, fb });
    this.liveMul = LIVE_INTERVAL[Math.min(this.frozen.length, LIVE_INTERVAL.length - 1)]!;
    if (this.delayGain) ramp(this.delayGain.gain, 0.36, now, 0.08);
    return this.frozen.length;
  }

  popLock(): number {
    if (!this.ctx || this.frozen.length === 0) return 0;
    this.releaseVoice(this.frozen.pop()!, this.ctx.currentTime);
    this.liveMul = LIVE_INTERVAL[Math.min(this.frozen.length, LIVE_INTERVAL.length - 1)]!;
    return this.frozen.length;
  }

  clearLocks() {
    if (!this.ctx) {
      this.frozen = [];
      this.liveMul = 1;
      return;
    }
    const now = this.ctx.currentTime;
    while (this.frozen.length) this.releaseVoice(this.frozen.pop()!, now);
    this.liveMul = 1;
  }

  private releaseVoice(v: FrozenVoice, now: number) {
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      const stopAt = now + 0.32;
      for (const o of v.osc) o.stop(stopAt);
      v.noise.stop(stopAt);
      window.setTimeout(() => {
        try {
          v.gain.disconnect();
          v.filter.disconnect();
          v.delay.disconnect();
          v.fb.disconnect();
        } catch {
          /* already gone */
        }
      }, 400);
    } catch {
      /* already stopped */
    }
  }

  tap(_amp = 0.14) {
    /* The Hum has no attack click. Kept as a no-op for call sites. */
  }

  dispose() {
    this.stopMic();
    this.clearLocks();
    for (const id of [...this.live.keys()]) this.releaseLive(id);
    try {
      for (const p of this.hum) p.osc.stop();
      this.lfo?.stop();
      this.noise?.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}
