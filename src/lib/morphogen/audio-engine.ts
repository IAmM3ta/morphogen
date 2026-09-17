import { runtime } from "./runtime";
import type { Brush } from "./presets";

function ramp(param: AudioParam, value: number, now: number, t = 0.05) {
  param.setTargetAtTime(value, now, t);
}

/** Live voice interval above frozen layers: unison, fifth, octave, fourth. */
const LIVE_INTERVAL = [1, 1.5, 2, 4 / 3, 5 / 4];

/** Dorian-ish pentatonic gravity so the theremin still sings in key. */
const PENTA = [0, 2, 3, 5, 7, 9, 10];

function yToHz(y: number, pitchTilt: number): number {
  const ny = Math.max(0, Math.min(1, 1 - y + pitchTilt * 0.06));
  return 82.41 * Math.pow(2, ny * 3.15);
}

function snapHz(hz: number, amount: number): number {
  const midi = 69 + 12 * Math.log2(Math.max(20, hz) / 440);
  const oct = Math.floor(midi / 12);
  const deg = midi - oct * 12;
  let best = PENTA[0]!;
  let bestD = 99;
  for (const p of PENTA) {
    const d = Math.abs(deg - p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  const snapped = 440 * Math.pow(2, (oct * 12 + best - 69) / 12);
  return hz * (1 - amount) + snapped * amount;
}

type LiveVoice = {
  id: number;
  osc: OscillatorNode;
  detune: OscillatorNode;
  harm: OscillatorNode;
  sub: OscillatorNode;
  fm: OscillatorNode;
  fmGain: GainNode;
  mix: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  gate: GainNode;
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
  private drone1: OscillatorNode | null = null;
  private drone2: OscillatorNode | null = null;
  private harm: OscillatorNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private harmGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  private echo: DelayNode | null = null;
  private echoGain: GainNode | null = null;
  private clickGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private fft = new Float32Array(64);
  private lastImpulse = 0;
  private lastEnergy = 0;
  private frozen: FrozenVoice[] = [];
  private live = new Map<number, LiveVoice>();
  private liveMul = 1;
  private noiseBuf: AudioBuffer | null = null;
  private capture: MediaStreamAudioDestinationNode | null = null;
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
    this.tiltFilter.frequency.value = 2400;
    this.tiltFilter.Q.value = 0.85;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.16;

    this.delay = ctx.createDelay(1.4);
    this.delay.delayTime.value = 0.34;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.32;
    this.echo = ctx.createDelay(0.4);
    this.echo.delayTime.value = 0.11;
    this.echoGain = ctx.createGain();
    this.echoGain.gain.value = 0.18;

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

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.bus);
    this.drone1 = ctx.createOscillator();
    this.drone1.type = "sine";
    this.drone1.frequency.value = 55;
    this.drone1.connect(this.droneGain);
    this.drone1.start();
    this.drone2 = ctx.createOscillator();
    this.drone2.type = "sine";
    this.drone2.frequency.value = 55.4;
    this.drone2.connect(this.droneGain);
    this.drone2.start();

    this.harmGain = ctx.createGain();
    this.harmGain.gain.value = 0;
    this.harmGain.connect(this.bus);
    this.harm = ctx.createOscillator();
    this.harm.type = "triangle";
    this.harm.frequency.value = 220;
    this.harm.connect(this.harmGain);
    this.harm.start();

    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = n.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuf = n;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = n;
    this.noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 800;
    this.noiseFilter.Q.value = 1.4;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.bus);
    this.noise.start();

    this.clickGain = ctx.createGain();
    this.clickGain.gain.value = 0.9;
    this.clickGain.connect(this.bus);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;

    ramp(this.master.gain, this.muted ? 0 : this.volume * this.volume, ctx.currentTime, 0.08);
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

  private allocVoice(id: number): LiveVoice {
    const ctx = this.ctx!;
    const mix = ctx.createGain();
    mix.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.9;
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
    osc.frequency.value = 220;
    const oscG = ctx.createGain();
    oscG.gain.value = 0.42;
    osc.connect(oscG);
    oscG.connect(mix);

    const detune = ctx.createOscillator();
    detune.type = "sine";
    detune.frequency.value = 221;
    const detG = ctx.createGain();
    detG.gain.value = 0.28;
    detune.connect(detG);
    detG.connect(mix);

    const harm = ctx.createOscillator();
    harm.type = "triangle";
    harm.frequency.value = 440;
    const harmG = ctx.createGain();
    harmG.gain.value = 0.12;
    harm.connect(harmG);
    harmG.connect(mix);

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 110;
    const subG = ctx.createGain();
    subG.gain.value = 0.16;
    sub.connect(subG);
    subG.connect(mix);

    const fm = ctx.createOscillator();
    fm.type = "sine";
    fm.frequency.value = 5;
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

    const v: LiveVoice = { id, osc, detune, harm, sub, fm, fmGain, mix, filter, pan, gate };
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
    const sense = runtime.sense;
    const hz = snapHz(yToHz(y, sense.pitch), 0.28) * this.liveMul;
    this.lastHz = hz;
    const amp =
      (0.1 + pressure * 0.55 + radius * 0.18) *
      (0.72 + Math.max(0, 1 - y) * 0.18) *
      (0.85 + sense.gforce * 0.04);
    const cutoff = 700 + pressure * 2200 + (1 - y) * 900 + sense.pitch * 400 + runtime.stats.edge * 500;
    const vib = 3.2 + sense.spin * 8 + Math.abs(sense.roll) * 2;
    const fmAmt = 2 + sense.spin * 22 + pressure * 8 + runtime.mic * 18;

    ramp(v.osc.frequency, hz, now, 0.018);
    ramp(v.detune.frequency, hz * (1.004 + sense.roll * 0.006), now, 0.02);
    ramp(v.harm.frequency, Math.min(2400, hz * 2), now, 0.03);
    ramp(v.sub.frequency, hz * 0.5, now, 0.03);
    ramp(v.fm.frequency, vib, now, 0.05);
    ramp(v.fmGain.gain, fmAmt, now, 0.05);
    ramp(v.filter.frequency, Math.max(220, Math.min(6200, cutoff)), now, 0.04);
    ramp(v.pan.pan, Math.max(-0.9, Math.min(0.9, (x - 0.5) * 1.6 + sense.yaw * 0.15)), now, 0.04);
    ramp(v.mix.gain, Math.max(0.0001, Math.min(0.55, amp)), now, 0.03);
  }

  tick() {
    if (
      !this.enabled ||
      !this.ctx ||
      !this.drone1 ||
      !this.drone2 ||
      !this.harm ||
      !this.droneGain ||
      !this.harmGain ||
      !this.noiseFilter ||
      !this.noiseGain ||
      !this.tiltFilter ||
      !this.delayGain
    )
      return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = runtime.stats;
    const energy = s.energy;
    const v = s.meanV;
    const edge = s.edge;
    const sense = runtime.sense;
    const mic = this.readMic();

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

    const lead = this.live.size > 0 ? 0.55 : 1;
    const base = (41.2 + energy * 14 + (1 - s.cy) * 8 + sense.pitch * 4) * this.liveMul;
    ramp(this.drone1.frequency, base, now, 0.12);
    ramp(this.drone2.frequency, base * (1.004 + sense.roll * 0.01), now, 0.12);
    ramp(this.droneGain.gain, (0.045 + energy * 0.11 + Math.abs(sense.pitch) * 0.03) * lead, now, 0.08);

    const harmHz = 98 * Math.pow(2, (1 - s.cy) * 1.05 + s.cx * 0.22 + sense.yaw * 0.08) * this.liveMul;
    ramp(this.harm.frequency, Math.min(720, harmHz), now, 0.1);
    ramp(this.harmGain.gain, (0.02 + v * 0.08 + edge * 0.05 + mic.mid * 0.04) * lead, now, 0.07);

    ramp(this.noiseFilter.frequency, 280 + edge * 1600 + energy * 240 + sense.spin * 900, now, 0.07);
    ramp(this.noiseGain.gain, 0.01 + edge * 0.05 + runtime.mic * 0.1 + sense.spin * 0.04 + runtime.pointerMotion * 0.03, now, 0.06);

    const tiltCut = 1400 + energy * 1600 + v * 400 + sense.pitch * 900 + this.live.size * 180;
    ramp(this.tiltFilter.frequency, Math.max(280, Math.min(7800, tiltCut)), now, 0.08);
    ramp(this.delayGain.gain, 0.24 + energy * 0.14 + Math.abs(sense.roll) * 0.08, now, 0.14);
    if (this.echoGain) ramp(this.echoGain.gain, 0.12 + sense.spin * 0.16, now, 0.1);

    if (energy - this.lastEnergy > 0.14 && now - this.lastImpulse > 0.5) {
      this.impulse(now, 0.07 + energy * 0.1);
      this.lastImpulse = now;
    }
    this.lastEnergy = energy;
  }

  lockLoop(): number {
    if (!this.ctx || !this.drone1 || !this.harm || !this.master || !this.enabled) return this.frozen.length;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.frozen.length >= 4) this.releaseVoice(this.frozen.shift()!, now);

    const gain = ctx.createGain();
    const n = this.frozen.length + 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.05, 0.2 / n), now + 0.06);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.tiltFilter?.frequency.value ?? 1400;
    filter.Q.value = 0.8;

    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.58 + this.frozen.length * 0.12;
    const fb = ctx.createGain();
    fb.gain.value = 0.8;

    gain.connect(filter);
    filter.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    filter.connect(this.master);
    delay.connect(this.master);

    const freqs = [
      this.lastHz || this.drone1.frequency.value,
      (this.lastHz || this.drone1.frequency.value) * 1.5,
      this.harm.frequency.value,
    ];
    const osc: OscillatorNode[] = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = freqs[i]!;
      const og = ctx.createGain();
      og.gain.value = i === 2 ? 0.24 : 0.2;
      o.connect(og);
      og.connect(gain);
      o.start(now);
      osc.push(o);
    }

    const noise = ctx.createBufferSource();
    if (this.noiseBuf) noise.buffer = this.noiseBuf;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.05 + runtime.stats.edge * 0.08;
    noise.connect(ng);
    ng.connect(filter);
    noise.start(now);

    this.frozen.push({ osc, noise, gain, filter, delay, fb });
    this.liveMul = LIVE_INTERVAL[Math.min(this.frozen.length, LIVE_INTERVAL.length - 1)]!;
    if (this.delayGain) ramp(this.delayGain.gain, 0.48, now, 0.04);
    this.impulse(now, 0.2);
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

  tap(amp = 0.14) {
    if (!this.ctx) return;
    this.impulse(this.ctx.currentTime, amp);
  }

  private impulse(now: number, amp: number) {
    if (!this.ctx || !this.clickGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = this.lastHz * 0.5 || 90;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(g);
    g.connect(this.clickGain);
    osc.start(now);
    osc.stop(now + 0.2);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  dispose() {
    this.stopMic();
    this.clearLocks();
    for (const id of [...this.live.keys()]) this.releaseLive(id);
    try {
      this.drone1?.stop();
      this.drone2?.stop();
      this.harm?.stop();
      this.noise?.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}
