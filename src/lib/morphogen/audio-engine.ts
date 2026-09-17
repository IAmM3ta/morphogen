import { runtime } from "./runtime";

function ramp(param: AudioParam, value: number, now: number, t = 0.05) {
  param.setTargetAtTime(value, now, t);
}

/** Live voice interval above frozen layers: unison, fifth, octave, fourth. */
const LIVE_INTERVAL = [1, 1.5, 2, 4 / 3, 5 / 4];

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
  private filter: BiquadFilterNode | null = null;
  private clickGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private fft = new Float32Array(64);
  private lastImpulse = 0;
  private lastEnergy = 0;
  private frozen: FrozenVoice[] = [];
  private liveMul = 1;
  volume = 0.55;
  muted = false;
  enabled = false;

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
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 0.7;

    this.delay = ctx.createDelay(1.2);
    this.delay.delayTime.value = 0.38;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.28;
    this.filter.connect(this.delay);
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.filter);
    this.filter.connect(this.master);
    this.master.connect(ctx.destination);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.filter);
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
    this.harmGain.connect(this.filter);
    this.harm = ctx.createOscillator();
    this.harm.type = "triangle";
    this.harm.frequency.value = 220;
    this.harm.connect(this.harmGain);
    this.harm.start();

    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = n.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
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
    this.noiseGain.connect(this.filter);
    this.noise.start();

    this.clickGain = ctx.createGain();
    this.clickGain.gain.value = 0;
    this.clickGain.connect(this.filter);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;

    ramp(this.master.gain, this.muted ? 0 : this.volume * this.volume, ctx.currentTime, 0.08);
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
      !this.filter ||
      !this.delayGain
    )
      return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = runtime.stats;
    const energy = s.energy;
    const v = s.meanV;
    const edge = s.edge;
    const cx = s.cx;
    const cy = s.cy;

    const base = (48 + energy * 18 + (1 - cy) * 12) * this.liveMul;
    ramp(this.drone1.frequency, base, now, 0.14);
    ramp(this.drone2.frequency, base * 1.005 + cx * 0.8 * this.liveMul, now, 0.14);
    const liveGain = Math.max(0.4, 1 - this.frozen.length * 0.12);
    ramp(this.droneGain.gain, (0.07 + energy * 0.14) * liveGain, now, 0.1);

    const harmHz = 98 * Math.pow(2, (1 - cy) * 1.1 + cx * 0.25) * this.liveMul;
    ramp(this.harm.frequency, Math.min(660, harmHz), now, 0.12);
    ramp(this.harmGain.gain, (0.015 + v * 0.07 + edge * 0.04) * liveGain, now, 0.08);

    ramp(this.noiseFilter.frequency, 320 + edge * 1400 + energy * 220, now, 0.08);
    ramp(this.noiseGain.gain, 0.006 + edge * 0.04 + runtime.mic * 0.08, now, 0.08);
    ramp(this.filter.frequency, 640 + energy * 1400 + v * 500, now, 0.1);
    ramp(this.delayGain.gain, 0.22 + energy * 0.12, now, 0.16);

    if (energy - this.lastEnergy > 0.14 && now - this.lastImpulse > 0.55) {
      this.impulse(now, 0.06 + energy * 0.1);
      this.lastImpulse = now;
    }
    this.lastEnergy = energy;
  }

  /** Freeze the current voice as a looping layer. Live synth keeps following the field. */
  lockLoop(): number {
    if (!this.ctx || !this.drone1 || !this.harm || !this.master || !this.enabled) return this.frozen.length;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.frozen.length >= 4) this.releaseVoice(this.frozen.shift()!, now);

    const gain = ctx.createGain();
    const n = this.frozen.length + 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.04, 0.16 / n), now + 0.06);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.filter?.frequency.value ?? 1400;
    filter.Q.value = 0.8;

    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.62 + this.frozen.length * 0.14;
    const fb = ctx.createGain();
    fb.gain.value = 0.78;

    gain.connect(filter);
    filter.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    filter.connect(this.master);
    delay.connect(this.master);

    const freqs = [
      this.drone1.frequency.value,
      this.drone2?.frequency.value ?? this.drone1.frequency.value * 1.007,
      this.harm.frequency.value,
    ];
    const osc: OscillatorNode[] = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = freqs[i]!;
      const og = ctx.createGain();
      og.gain.value = i === 2 ? 0.22 : 0.18;
      o.connect(og);
      og.connect(gain);
      o.start(now);
      osc.push(o);
    }

    const noise = ctx.createBufferSource();
    if (this.noise?.buffer) noise.buffer = this.noise.buffer;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.04 + runtime.stats.edge * 0.08;
    noise.connect(ng);
    ng.connect(filter);
    noise.start(now);

    this.frozen.push({ osc, noise, gain, filter, delay, fb });
    this.liveMul = LIVE_INTERVAL[Math.min(this.frozen.length, LIVE_INTERVAL.length - 1)]!;

    if (this.delayGain) {
      ramp(this.delayGain.gain, 0.42, now, 0.04);
    }
    this.impulse(now, 0.18);
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

  private impulse(now: number, amp: number) {
    if (!this.ctx || !this.clickGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 90 + runtime.stats.cx * 80;
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
