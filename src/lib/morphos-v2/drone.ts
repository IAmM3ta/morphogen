/**
 * Drone Synth — the v2 lead voice. One evolving, mono-pitched drone with a
 * stereo body:
 *
 *   4-table wavetable morph (soft → glass → vox → buzz)  ┐
 *   2 detuned saws, hard-panned (width, compass spread)  ├→ drive → LP → LP(res) → amp → pan → dry
 *   upper voice on a compass-walked scale degree         ┘                         ├→ ping-pong delay
 *   sub sine one octave down (bypasses the filter)  ────────────────→ amp         └→ convolver ⇄ shimmer
 *   noise bursts on shake (band-passed at the pitch)
 *
 * Slow LFOs breathe the filter and chorus the saws.
 */
import { features } from "./features";
import { droneTables, ensureShimmerWorklet, makeImpulse, noiseBuffer, saturateCurve, setTarget } from "./dsp";
import { hz, midiFromHz, positionToMidi, scaleNotes } from "./music";
import { clamp, clamp01 } from "./smoothing";

export type DroneVoiceId = "glass" | "choir" | "abyss" | "solar";

export type DroneSettings = {
  voice: DroneVoiceId;
  /** 1 = snap to key/mode, 0 = free theremin. */
  quantize: number;
  /** 0 = instant, 1 = long portamento. */
  glide: number;
  space: number;
  shimmer: number;
  sub: number;
  level: number;
};

export const DRONE_VOICES: { id: DroneVoiceId; name: string; blurb: string }[] = [
  { id: "glass", name: "Glass", blurb: "Clear, singing" },
  { id: "choir", name: "Choir", blurb: "Vowels in the dark" },
  { id: "abyss", name: "Abyss", blurb: "Deep and slow" },
  { id: "solar", name: "Solar", blurb: "Bright, wide saws" },
];

type VoiceShape = { lo: number; hi: number; morphLo: number; morphHi: number; upper: number; saw: number; cutoff: number; lfo: number };

const VOICE: Record<DroneVoiceId, VoiceShape> = {
  glass: { lo: 43, hi: 74, morphLo: 0, morphHi: 2.2, upper: 0.32, saw: 0.18, cutoff: 1.1, lfo: 0.09 },
  choir: { lo: 38, hi: 67, morphLo: 1.2, morphHi: 2.6, upper: 0.45, saw: 0.12, cutoff: 0.9, lfo: 0.07 },
  abyss: { lo: 26, hi: 52, morphLo: 0.4, morphHi: 3, upper: 0.22, saw: 0.22, cutoff: 0.55, lfo: 0.045 },
  solar: { lo: 45, hi: 79, morphLo: 1.5, morphHi: 3, upper: 0.4, saw: 0.42, cutoff: 1.4, lfo: 0.13 },
};

export const DEFAULT_DRONE: DroneSettings = {
  voice: "glass",
  quantize: 1,
  glide: 0.35,
  space: 0.55,
  shimmer: 0.35,
  sub: 0.55,
  level: 0.8,
};

/** Upper voice intervals (semitones) walked by the compass, snapped to the scale. */
const WALK = [7, 4, 5, 9, 12, 7, 10, 3];

export type DronePerformance = {
  gate: number;
  x: number;
  y: number;
  tiltX: number;
  tiltY: number;
  heading: number;
  shake: number;
  jolt: boolean;
};

export class DroneSynth {
  readonly out: GainNode;
  readonly sendBus: GainNode;
  private tables: OscillatorNode[] = [];
  private tableGains: GainNode[] = [];
  private sawL: OscillatorNode;
  private sawR: OscillatorNode;
  private sawGain: GainNode;
  private upper: OscillatorNode;
  private upperGain: GainNode;
  private sub: OscillatorNode;
  private subGain: GainNode;
  private drive: GainNode;
  private shaper: WaveShaperNode;
  private f1: BiquadFilterNode;
  private f2: BiquadFilterNode;
  private amp: GainNode;
  private subAmp: GainNode;
  private pan: StereoPannerNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private chorus: OscillatorNode;
  private chorusGain: GainNode;
  private noise: AudioBufferSourceNode;
  private noiseBand: BiquadFilterNode;
  private noiseGain: GainNode;
  private delayL: DelayNode;
  private delayR: DelayNode;
  private fbL: GainNode;
  private fbR: GainNode;
  private delaySend: GainNode;
  private delayTone: BiquadFilterNode;
  private verb: ConvolverNode;
  private verbSend: GainNode;
  private verbOut: GainNode;
  private shimmerNode: AudioWorkletNode | null = null;
  private shimmerGain: GainNode;
  private shimmerLoop: DelayNode;
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  settings: DroneSettings = { ...DEFAULT_DRONE };
  state = { hz: 110, norm: 0.4, level: 0, bright: 0.4, spread: 0.2, midi: 45 };
  private lastMidi = 45;

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    const c = ctx;
    const t0 = c.currentTime;
    this.out = c.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
    this.sendBus = c.createGain();

    this.drive = c.createGain();
    this.drive.gain.value = 0.2;
    this.shaper = c.createWaveShaper();
    this.shaper.curve = saturateCurve(1.6);
    this.shaper.oversample = "2x";
    this.f1 = c.createBiquadFilter();
    this.f1.type = "lowpass";
    this.f1.frequency.value = 900;
    this.f1.Q.value = 0.5;
    this.f2 = c.createBiquadFilter();
    this.f2.type = "lowpass";
    this.f2.frequency.value = 1200;
    this.f2.Q.value = 1.2;
    this.amp = c.createGain();
    this.amp.gain.value = 0;
    this.subAmp = c.createGain();
    this.subAmp.gain.value = 0;
    this.pan = c.createStereoPanner();
    this.drive.connect(this.shaper);
    this.shaper.connect(this.f1);
    this.f1.connect(this.f2);
    this.f2.connect(this.amp);
    this.amp.connect(this.pan);
    this.pan.connect(this.out);
    this.subAmp.connect(this.out);

    const tables = droneTables(c);
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator();
      o.setPeriodicWave(tables[i]!);
      o.frequency.value = 110;
      const g = c.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      o.connect(g);
      g.connect(this.drive);
      this.tables.push(o);
      this.tableGains.push(g);
    }
    this.sawGain = c.createGain();
    this.sawGain.gain.value = 0.18;
    this.sawL = c.createOscillator();
    this.sawR = c.createOscillator();
    this.sawL.type = "sawtooth";
    this.sawR.type = "sawtooth";
    const pl = c.createStereoPanner();
    const pr = c.createStereoPanner();
    pl.pan.value = -0.85;
    pr.pan.value = 0.85;
    this.sawL.connect(pl);
    this.sawR.connect(pr);
    pl.connect(this.sawGain);
    pr.connect(this.sawGain);
    this.sawGain.connect(this.drive);

    this.upper = c.createOscillator();
    this.upper.type = "triangle";
    this.upperGain = c.createGain();
    this.upperGain.gain.value = 0.3;
    this.upper.connect(this.upperGain);
    this.upperGain.connect(this.drive);

    this.sub = c.createOscillator();
    this.sub.type = "sine";
    this.subGain = c.createGain();
    this.subGain.gain.value = 0.5;
    const subLp = c.createBiquadFilter();
    subLp.type = "lowpass";
    subLp.frequency.value = 160;
    this.sub.connect(this.subGain);
    this.subGain.connect(subLp);
    subLp.connect(this.subAmp);

    this.lfo = c.createOscillator();
    this.lfo.frequency.value = 0.09;
    this.lfoGain = c.createGain();
    this.lfoGain.gain.value = 260;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.f1.frequency);
    this.lfoGain.connect(this.f2.frequency);
    this.chorus = c.createOscillator();
    this.chorus.frequency.value = 0.21;
    this.chorusGain = c.createGain();
    this.chorusGain.gain.value = 6;
    this.chorus.connect(this.chorusGain);
    this.chorusGain.connect(this.sawL.detune);
    this.chorusGain.connect(this.sawR.detune);

    this.noise = c.createBufferSource();
    this.noise.buffer = noiseBuffer(c);
    this.noise.loop = true;
    this.noiseBand = c.createBiquadFilter();
    this.noiseBand.type = "bandpass";
    this.noiseBand.Q.value = 3;
    this.noiseBand.frequency.value = 1200;
    this.noiseGain = c.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseBand);
    this.noiseBand.connect(this.noiseGain);
    this.noiseGain.connect(this.pan);
    this.noiseGain.connect(this.sendBus);

    // Sends: ping-pong delay and convolution space.
    this.amp.connect(this.sendBus);
    this.delaySend = c.createGain();
    this.delaySend.gain.value = 0.25;
    this.delayL = c.createDelay(2);
    this.delayR = c.createDelay(2);
    this.delayL.delayTime.value = 0.42;
    this.delayR.delayTime.value = 0.63;
    this.fbL = c.createGain();
    this.fbR = c.createGain();
    this.fbL.gain.value = 0.42;
    this.fbR.gain.value = 0.42;
    this.delayTone = c.createBiquadFilter();
    this.delayTone.type = "lowpass";
    this.delayTone.frequency.value = 3200;
    const merger = c.createChannelMerger(2);
    this.sendBus.connect(this.delaySend);
    this.delaySend.connect(this.delayTone);
    this.delayTone.connect(this.delayL);
    this.delayL.connect(this.fbL);
    this.fbL.connect(this.delayR);
    this.delayR.connect(this.fbR);
    this.fbR.connect(this.delayL);
    this.delayL.connect(merger, 0, 0);
    this.delayR.connect(merger, 0, 1);
    const delayOut = c.createGain();
    delayOut.gain.value = 0.6;
    merger.connect(delayOut);
    delayOut.connect(this.out);

    this.verbSend = c.createGain();
    this.verbSend.gain.value = 0.4;
    this.verb = c.createConvolver();
    this.verb.buffer = makeImpulse(c, 4.6, 2.4);
    this.verbOut = c.createGain();
    this.verbOut.gain.value = 0.7;
    this.sendBus.connect(this.verbSend);
    delayOut.connect(this.verbSend);
    this.verbSend.connect(this.verb);
    this.verb.connect(this.verbOut);
    this.verbOut.connect(this.out);
    this.shimmerGain = c.createGain();
    this.shimmerGain.gain.value = 0;
    this.shimmerLoop = c.createDelay(0.2);
    this.shimmerLoop.delayTime.value = 0.045;

    this.sources = [...this.tables, this.sawL, this.sawR, this.upper, this.sub, this.lfo, this.chorus, this.noise];
    for (const s of this.sources) s.start(t0);
    this.nodes = [
      this.out,
      this.sendBus,
      this.drive,
      this.shaper,
      this.f1,
      this.f2,
      this.amp,
      this.subAmp,
      this.pan,
      ...this.tableGains,
      this.sawGain,
      pl,
      pr,
      this.upperGain,
      this.subGain,
      subLp,
      this.lfoGain,
      this.chorusGain,
      this.noiseBand,
      this.noiseGain,
      this.delaySend,
      this.delayL,
      this.delayR,
      this.fbL,
      this.fbR,
      this.delayTone,
      merger,
      delayOut,
      this.verbSend,
      this.verb,
      this.verbOut,
      this.shimmerGain,
      this.shimmerLoop,
    ];
    this.applySettings(t0);
  }

  /** Granular octave-up shimmer in the reverb loop, when AudioWorklet exists. */
  async attachShimmer(): Promise<boolean> {
    const ok = await ensureShimmerWorklet(this.ctx);
    if (!ok || this.shimmerNode) return ok;
    try {
      const node = new AudioWorkletNode(this.ctx, "morphos-shimmer", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.verb.connect(node);
      node.connect(this.shimmerGain);
      // Feedback through a short delay (Web Audio needs a DelayNode in any cycle).
      this.shimmerGain.connect(this.shimmerLoop);
      this.shimmerLoop.connect(this.verbSend);
      this.shimmerGain.connect(this.out);
      this.shimmerNode = node;
      this.applySettings(this.ctx.currentTime);
      return true;
    } catch {
      return false;
    }
  }

  get hasShimmer() {
    return Boolean(this.shimmerNode);
  }

  setSettings(p: Partial<DroneSettings>) {
    this.settings = { ...this.settings, ...p };
    this.applySettings(this.ctx.currentTime);
  }

  /** Sync the ping-pong to the transport (dotted eighth / quarter). */
  syncDelay(bpm: number | null) {
    const now = this.ctx.currentTime;
    if (bpm && bpm > 30) {
      const beat = 60 / bpm;
      setTarget(this.delayL.delayTime, Math.min(1.9, beat * 0.75), now, 0.2);
      setTarget(this.delayR.delayTime, Math.min(1.9, beat * 1.5), now, 0.2);
    } else {
      setTarget(this.delayL.delayTime, 0.42, now, 0.3);
      setTarget(this.delayR.delayTime, 0.63, now, 0.3);
    }
  }

  private applySettings(now: number) {
    const s = this.settings;
    const v = VOICE[s.voice] ?? VOICE.glass;
    setTarget(this.delaySend.gain, 0.08 + s.space * 0.32, now, 0.1);
    setTarget(this.verbSend.gain, 0.12 + s.space * 0.7, now, 0.1);
    setTarget(this.shimmerGain.gain, this.shimmerNode ? s.shimmer * 0.55 : 0, now, 0.1);
    setTarget(this.subGain.gain, s.sub * 0.9, now, 0.1);
    setTarget(this.upperGain.gain, v.upper, now, 0.2);
    setTarget(this.lfo.frequency, v.lfo, now, 0.5);
    if (this.shimmerNode) {
      const d = this.shimmerNode.parameters.get("density");
      if (d) setTarget(d, 0.3 + s.shimmer * 0.6, now, 0.2);
    }
  }

  /** Called each control frame with the conditioned hand + sensor state. */
  perform(p: DronePerformance, time = this.ctx.currentTime) {
    const s = this.settings;
    const v = VOICE[s.voice] ?? VOICE.glass;
    const pitchPos = clamp01(1 - p.y);
    const midi = positionToMidi(pitchPos, v.lo, v.hi, s.quantize);
    const glideTau = 0.004 + s.glide * s.glide * 0.6;
    if (p.gate > 0.001) this.lastMidi = midi;
    const m = p.gate > 0.001 ? midi : this.lastMidi;
    const f = hz(m);
    // Compass: walk the upper voice through scale intervals; spread the saws.
    const head = ((p.heading % 360) + 360) % 360;
    const walk = WALK[Math.floor(head / 45) % WALK.length] ?? 7;
    const upperMidi = this.snap(m + walk);
    const spread = 4 + 24 * (0.5 + 0.5 * Math.sin((p.heading * Math.PI) / 180));
    for (const o of this.tables) setTarget(o.frequency, f, time, glideTau);
    setTarget(this.sawL.frequency, f, time, glideTau);
    setTarget(this.sawR.frequency, f, time, glideTau);
    setTarget(this.sawL.detune, -spread, time, 0.3);
    setTarget(this.sawR.detune, spread, time, 0.3);
    setTarget(this.upper.frequency, hz(upperMidi), time, glideTau + 0.25);
    setTarget(this.sub.frequency, f / 2, time, glideTau);

    // Timbre: X morphs the tables and opens the filter.
    const morph = v.morphLo + (v.morphHi - v.morphLo) * clamp01(p.x);
    for (let i = 0; i < 4; i++) {
      setTarget(this.tableGains[i]!.gain, Math.max(0, 1 - Math.abs(morph - i)) * 0.9, time, 0.08);
    }
    setTarget(this.sawGain.gain, v.saw * (0.6 + p.x * 0.8), time, 0.1);
    const tiltMul = Math.pow(2, clamp(p.tiltY, -1, 1) * 1.6);
    const cutoff = clamp(180 * Math.pow(2, clamp01(p.x) * 5.4) * v.cutoff * tiltMul + f * 1.5, 120, 12000);
    setTarget(this.f1.frequency, cutoff * 1.4, time, 0.06);
    setTarget(this.f2.frequency, cutoff, time, 0.06);
    setTarget(this.f2.Q, 0.8 + Math.abs(p.tiltX) * 7, time, 0.1);
    setTarget(this.pan.pan, clamp(p.tiltX * 0.6, -0.8, 0.8), time, 0.1);
    setTarget(this.lfoGain.gain, cutoff * 0.25, time, 0.3);
    this.noiseBand.frequency.setTargetAtTime(clamp(f * 8, 400, 9000), time, 0.05);

    // Amplitude: gate × level, long release so it rings into the space.
    const level = clamp01(p.gate) * s.level;
    const tau = p.gate > this.state.level ? 0.12 : 0.9;
    setTarget(this.amp.gain, level * 0.9, time, tau);
    setTarget(this.subAmp.gain, level * 0.8, time, tau);

    // Shake: noise bursts riding the pitch, plus a constant airy layer.
    const air = clamp01(p.shake) * 0.25 * Math.max(0.3, level);
    if (p.jolt) {
      try {
        this.noiseGain.gain.cancelScheduledValues(time);
        this.noiseGain.gain.setTargetAtTime(0.45 * Math.max(0.4, level), time, 0.004);
        this.noiseGain.gain.setTargetAtTime(air, time + 0.04, 0.18);
      } catch {
        /* ignore */
      }
    } else {
      setTarget(this.noiseGain.gain, air, time, 0.2);
    }

    this.state.hz = f;
    this.state.midi = m;
    this.state.norm = clamp01((m - v.lo) / Math.max(1, v.hi - v.lo));
    this.state.level = level;
    this.state.bright = clamp01(p.x);
    this.state.spread = clamp01((spread - 4) / 24);
    const d = features.drone;
    d.hz = f;
    d.norm = this.state.norm;
    d.level = level;
    d.bright = this.state.bright;
    d.spread = this.state.spread;
  }

  private snap(m: number): number {
    const notes = scaleNotes(m - 3, m + 3);
    if (!notes.length) return Math.round(m);
    let best = notes[0]!;
    for (const n of notes) if (Math.abs(n - m) < Math.abs(best - m)) best = n;
    return best;
  }

  currentMidi() {
    return midiFromHz(this.state.hz);
  }

  dispose() {
    const t = this.ctx.currentTime;
    try {
      this.amp.gain.setTargetAtTime(0, t, 0.05);
      this.subAmp.gain.setTargetAtTime(0, t, 0.05);
    } catch {
      /* ignore */
    }
    for (const s of this.sources) {
      try {
        s.stop(t + 0.3);
      } catch {
        /* already */
      }
    }
    const nodes = this.nodes;
    const shimmer = this.shimmerNode;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* gone */
        }
      }
      try {
        shimmer?.disconnect();
      } catch {
        /* gone */
      }
    }, 450);
  }
}
