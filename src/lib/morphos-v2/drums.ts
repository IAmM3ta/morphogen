/**
 * Synthesised drum voices. Every hit is a short-lived node graph scheduled at
 * an exact audio time, so it works the same in a live AudioContext and an
 * OfflineAudioContext (WAV export).
 */
import { noiseBuffer, saturateCurve } from "./dsp";
import { hz } from "./music";
import { clamp01 } from "./smoothing";

export type DrumVoice = "kick" | "clap" | "hat" | "perc";

export class DrumKit {
  readonly out: GainNode;
  private kickShaper: WaveShaperNode;
  private noise: AudioBuffer;
  /** Called with the audio time of every kick (sidechain + visuals). */
  onKick: ((time: number, velocity: number) => void) | null = null;
  tone = 0.5;

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(dest);
    this.kickShaper = ctx.createWaveShaper();
    this.kickShaper.curve = saturateCurve(1.8);
    this.kickShaper.connect(this.out);
    this.noise = noiseBuffer(ctx);
  }

  trigger(voice: DrumVoice, time: number, velocity = 1, variant = 0, percMidi = 72) {
    const v = clamp01(velocity);
    if (v <= 0) return;
    try {
      if (voice === "kick") this.kick(time, v);
      else if (voice === "clap") this.clap(time, v);
      else if (voice === "hat") this.hat(time, v, variant === 2);
      else this.perc(time, v, percMidi);
    } catch {
      /* never break the scheduler */
    }
  }

  private kick(t: number, v: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = "sine";
    const g = c.createGain();
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.003);
    g.gain.setTargetAtTime(0.0001, t + 0.09, 0.11);
    o.connect(g);
    g.connect(this.kickShaper);
    o.start(t);
    o.stop(t + 0.75);
    // Click
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.001);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(this.out);
    n.start(t, Math.random() * 1.5);
    n.stop(t + 0.02);
    this.onKick?.(t, v);
  }

  private clap(t: number, v: number) {
    const c = this.ctx;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1150 + this.tone * 600;
    bp.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.011;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.55 * v, at + 0.001);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.009);
    }
    g.gain.setValueAtTime(0.4 * v, t + 0.034);
    g.gain.setTargetAtTime(0.0001, t + 0.036, 0.06);
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.connect(bp);
    bp.connect(g);
    g.connect(this.out);
    n.start(t, Math.random() * 1.5);
    n.stop(t + 0.4);
  }

  private hat(t: number, v: number, open: boolean) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200 + this.tone * 1800;
    const bp = c.createBiquadFilter();
    bp.type = "peaking";
    bp.frequency.value = 10500;
    bp.gain.value = 6;
    const g = c.createGain();
    const len = open ? 0.32 : 0.045;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.001);
    g.gain.setTargetAtTime(0.0001, t + 0.002, len / 3);
    n.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(this.out);
    n.start(t, Math.random() * 1.5);
    n.stop(t + len * 2.5 + 0.05);
  }

  /** FM bell-blip, tuned to the key. Metallic and a little alien. */
  private perc(t: number, v: number, midi: number) {
    const c = this.ctx;
    const f = hz(midi);
    const car = c.createOscillator();
    car.type = "sine";
    car.frequency.value = f;
    const mod = c.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 3.51;
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * 2.4 * v, t);
    mg.gain.setTargetAtTime(0, t, 0.05);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28 * v, t + 0.002);
    g.gain.setTargetAtTime(0.0001, t + 0.004, 0.09);
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.7;
    car.connect(g);
    g.connect(pan);
    pan.connect(this.out);
    car.start(t);
    mod.start(t);
    car.stop(t + 0.6);
    mod.stop(t + 0.6);
  }

  dispose() {
    try {
      this.out.disconnect();
      this.kickShaper.disconnect();
    } catch {
      /* gone */
    }
  }
}
