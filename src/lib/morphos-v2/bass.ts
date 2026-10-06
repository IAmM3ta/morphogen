/**
 * Refined bass. One mono voice with persistent oscillators (so slides are
 * real portamento, like a 303) and three layer families:
 *
 *   sub   — pure sine, low-passed at 110 Hz, mono, the floor of the mix
 *   mid   — saw → asymmetric saturation → band-limited (HP 90 / LP 1.6 k),
 *           the part small speakers hear
 *   acid  — saw/square → two resonant low-passes with an accent-aware
 *           filter envelope (303-style accent + slide)
 *   reese — two detuned saws (±cents, slow drift), high-passed before the
 *           stereo spread so the low end stays mono
 *
 * Styles blend those layers. Everything sums into one bus with a 28 Hz
 * high-pass to remove rumble/DC.
 */
import { features } from "./features";
import { noiseBuffer, saturateCurve, setNow, setTarget } from "./dsp";
import { clamp, clamp01 } from "./smoothing";
import { hz } from "./music";

export type BassStyle = "sub" | "acid" | "reese";

export const BASS_STYLES: { id: BassStyle; name: string; blurb: string }[] = [
  { id: "sub", name: "Sub", blurb: "Sine floor + warm grit" },
  { id: "acid", name: "Acid", blurb: "303 squelch, accent + slide" },
  { id: "reese", name: "Reese", blurb: "Detuned saw growl" },
];

export type BassSettings = {
  style: BassStyle;
  cutoff: number;
  resonance: number;
  envMod: number;
  decay: number;
  drive: number;
  level: number;
  wave: "saw" | "square";
};

export const DEFAULT_BASS: BassSettings = {
  style: "acid",
  cutoff: 0.32,
  resonance: 0.62,
  envMod: 0.6,
  decay: 0.35,
  drive: 0.45,
  level: 0.8,
  wave: "saw",
};

const MIX: Record<BassStyle, { sub: number; mid: number; acid: number; reese: number }> = {
  sub: { sub: 1, mid: 0.42, acid: 0, reese: 0 },
  acid: { sub: 0.5, mid: 0, acid: 0.9, reese: 0 },
  reese: { sub: 0.65, mid: 0.1, acid: 0, reese: 0.85 },
};

export type BassNote = { midi: number; accent?: boolean; slide?: boolean; gate?: number; velocity?: number };

export class BassSynth {
  readonly out: GainNode;
  private sub: OscillatorNode;
  private mid: OscillatorNode;
  private acid: OscillatorNode;
  private reeseA: OscillatorNode;
  private reeseB: OscillatorNode;
  private drift: OscillatorNode;
  private subG: GainNode;
  private midG: GainNode;
  private acidG: GainNode;
  private reeseG: GainNode;
  private midShaper: WaveShaperNode;
  private acidF1: BiquadFilterNode;
  private acidF2: BiquadFilterNode;
  private acidShaper: WaveShaperNode;
  private reeseF: BiquadFilterNode;
  private amp: GainNode;
  private subAmp: GainNode;
  private click: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  settings: BassSettings = { ...DEFAULT_BASS };
  private lastFreq = 55;
  private gateOpenUntil = 0;
  liveOn = false;

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    const c = ctx;
    const t0 = c.currentTime;
    this.out = c.createGain();
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 28;
    hp.Q.value = 0.7;
    this.out.connect(hp);
    hp.connect(dest);

    this.amp = c.createGain();
    this.amp.gain.value = 0;
    this.subAmp = c.createGain();
    this.subAmp.gain.value = 0;
    this.amp.connect(this.out);
    this.subAmp.connect(this.out);

    // Sub
    this.sub = c.createOscillator();
    this.sub.type = "sine";
    this.subG = c.createGain();
    const subLp = c.createBiquadFilter();
    subLp.type = "lowpass";
    subLp.frequency.value = 110;
    subLp.Q.value = 0.5;
    this.sub.connect(this.subG);
    this.subG.connect(subLp);
    subLp.connect(this.subAmp);

    // Mid grit
    this.mid = c.createOscillator();
    this.mid.type = "sawtooth";
    this.midG = c.createGain();
    this.midShaper = c.createWaveShaper();
    this.midShaper.curve = saturateCurve(3.2);
    this.midShaper.oversample = "4x";
    const midHp = c.createBiquadFilter();
    midHp.type = "highpass";
    midHp.frequency.value = 90;
    const midLp = c.createBiquadFilter();
    midLp.type = "lowpass";
    midLp.frequency.value = 1600;
    this.mid.connect(this.midShaper);
    this.midShaper.connect(midHp);
    midHp.connect(midLp);
    midLp.connect(this.midG);
    this.midG.connect(this.amp);

    // Acid
    this.acid = c.createOscillator();
    this.acid.type = "sawtooth";
    this.acidG = c.createGain();
    this.acidF1 = c.createBiquadFilter();
    this.acidF2 = c.createBiquadFilter();
    this.acidF1.type = "lowpass";
    this.acidF2.type = "lowpass";
    this.acidShaper = c.createWaveShaper();
    this.acidShaper.curve = saturateCurve(2);
    this.acidShaper.oversample = "2x";
    const acidHp = c.createBiquadFilter();
    acidHp.type = "highpass";
    acidHp.frequency.value = 45;
    this.acid.connect(this.acidF1);
    this.acidF1.connect(this.acidF2);
    this.acidF2.connect(this.acidShaper);
    this.acidShaper.connect(acidHp);
    acidHp.connect(this.acidG);
    this.acidG.connect(this.amp);

    // Reese
    this.reeseA = c.createOscillator();
    this.reeseB = c.createOscillator();
    this.reeseA.type = "sawtooth";
    this.reeseB.type = "sawtooth";
    this.drift = c.createOscillator();
    this.drift.frequency.value = 0.18;
    const driftG = c.createGain();
    driftG.gain.value = 7;
    this.drift.connect(driftG);
    driftG.connect(this.reeseA.detune);
    const driftInv = c.createGain();
    driftInv.gain.value = -7;
    this.drift.connect(driftInv);
    driftInv.connect(this.reeseB.detune);
    this.reeseA.detune.value = -14;
    this.reeseB.detune.value = 14;
    this.reeseF = c.createBiquadFilter();
    this.reeseF.type = "lowpass";
    this.reeseF.frequency.value = 700;
    this.reeseF.Q.value = 1.1;
    const reeseHp = c.createBiquadFilter();
    reeseHp.type = "highpass";
    reeseHp.frequency.value = 120;
    const pA = c.createStereoPanner();
    const pB = c.createStereoPanner();
    pA.pan.value = -0.45;
    pB.pan.value = 0.45;
    const reeseMono = c.createBiquadFilter();
    reeseMono.type = "lowpass";
    reeseMono.frequency.value = 120;
    this.reeseG = c.createGain();
    this.reeseA.connect(this.reeseF);
    this.reeseB.connect(this.reeseF);
    this.reeseF.connect(reeseHp);
    reeseHp.connect(pA);
    reeseHp.connect(pB);
    pA.connect(this.reeseG);
    pB.connect(this.reeseG);
    this.reeseF.connect(reeseMono);
    reeseMono.connect(this.reeseG);
    this.reeseG.connect(this.amp);

    // Pluck transient for definition on small speakers.
    this.click = c.createGain();
    this.click.gain.value = 0;
    const clickSrc = c.createBufferSource();
    clickSrc.buffer = noiseBuffer(c);
    clickSrc.loop = true;
    const clickBp = c.createBiquadFilter();
    clickBp.type = "bandpass";
    clickBp.frequency.value = 2400;
    clickBp.Q.value = 1.4;
    clickSrc.connect(clickBp);
    clickBp.connect(this.click);
    this.click.connect(this.amp);

    this.sources = [this.sub, this.mid, this.acid, this.reeseA, this.reeseB, this.drift, clickSrc];
    for (const s of this.sources) {
      if (s instanceof OscillatorNode) s.frequency.value = s === this.drift ? 0.18 : 55;
      s.start(t0);
    }
    this.nodes = [
      this.out,
      hp,
      this.amp,
      this.subAmp,
      this.subG,
      subLp,
      this.midG,
      this.midShaper,
      midHp,
      midLp,
      this.acidG,
      this.acidF1,
      this.acidF2,
      this.acidShaper,
      acidHp,
      driftG,
      driftInv,
      this.reeseF,
      reeseHp,
      pA,
      pB,
      reeseMono,
      this.reeseG,
      this.click,
      clickBp,
    ];
    this.apply(t0);
  }

  setSettings(p: Partial<BassSettings>) {
    this.settings = { ...this.settings, ...p };
    this.apply(this.ctx.currentTime);
  }

  private apply(now: number) {
    const s = this.settings;
    const mix = MIX[s.style] ?? MIX.acid;
    setTarget(this.subG.gain, mix.sub * 0.9, now, 0.05);
    setTarget(this.midG.gain, mix.mid * (0.25 + s.drive * 0.5), now, 0.05);
    setTarget(this.acidG.gain, mix.acid * 0.55, now, 0.05);
    setTarget(this.reeseG.gain, mix.reese * 0.32, now, 0.05);
    this.acid.type = s.wave === "square" ? "square" : "sawtooth";
    this.midShaper.curve = saturateCurve(1.5 + s.drive * 5);
    this.acidShaper.curve = saturateCurve(1 + s.drive * 3);
    const q = 1 + s.resonance * 17;
    setTarget(this.acidF1.Q, q * 0.4, now, 0.05);
    setTarget(this.acidF2.Q, q, now, 0.05);
    setTarget(this.reeseF.frequency, 260 + s.cutoff * 2400, now, 0.08);
  }

  private baseCutoff() {
    return 70 * Math.pow(2, this.settings.cutoff * 6.2);
  }

  /** Schedule a sequenced note. `stepDur` lets slides glide over one step. */
  trigger(note: BassNote, time: number, stepDur: number) {
    const s = this.settings;
    const f = hz(clamp(note.midi, 16, 72));
    const accent = Boolean(note.accent);
    const vel = clamp01(note.velocity ?? 0.85) * (accent ? 1.25 : 1);
    const gate = Math.max(0.03, (note.gate ?? 0.5) * stepDur);
    const slideIn = Boolean(note.slide) && time < this.gateOpenUntil + 0.002;
    const oscs = [this.sub, this.mid, this.acid, this.reeseA, this.reeseB];
    for (const o of oscs) {
      const target = f;
      if (slideIn) {
        try {
          o.frequency.setTargetAtTime(target, time, 0.045);
        } catch {
          /* ignore */
        }
      } else {
        setNow(o.frequency, target, time);
      }
    }
    // Amp: tight attack. Slides tie (no retrigger).
    const level = s.level * vel * 0.9;
    if (slideIn) {
      // Tied note: drop the pending release from the previous step, hold level.
      try {
        this.amp.gain.cancelScheduledValues(time);
        this.subAmp.gain.cancelScheduledValues(time);
        this.amp.gain.setTargetAtTime(level, time, 0.012);
        this.subAmp.gain.setTargetAtTime(level, time, 0.012);
      } catch {
        /* ignore */
      }
    } else {
      try {
        this.amp.gain.cancelScheduledValues(time);
        this.subAmp.gain.cancelScheduledValues(time);
        this.amp.gain.setTargetAtTime(level, time, 0.003);
        this.subAmp.gain.setTargetAtTime(level, time, 0.004);
        this.click.gain.cancelScheduledValues(time);
        this.click.gain.setValueAtTime(0.0, time);
        this.click.gain.linearRampToValueAtTime(0.12 * vel, time + 0.002);
        this.click.gain.linearRampToValueAtTime(0, time + 0.012);
      } catch {
        /* ignore */
      }
    }
    // Filter envelope (accent: higher peak, shorter decay, 303-style).
    const base = this.baseCutoff();
    const peak = clamp(base * Math.pow(2, s.envMod * (accent ? 4.6 : 3.4)), 60, 14000);
    const decay = 0.04 + s.decay * (accent ? 0.22 : 0.5);
    for (const fl of [this.acidF1, this.acidF2]) {
      try {
        if (!slideIn) {
          fl.frequency.cancelScheduledValues(time);
          fl.frequency.setTargetAtTime(peak, time, 0.002);
          fl.frequency.setTargetAtTime(base, time + 0.006, decay);
        }
      } catch {
        /* ignore */
      }
    }
    const end = time + gate;
    this.gateOpenUntil = end;
    try {
      this.amp.gain.setTargetAtTime(0, end, 0.018);
      this.subAmp.gain.setTargetAtTime(0, end, 0.025);
    } catch {
      /* ignore */
    }
    this.lastFreq = f;
  }

  /** Extend the current gate (used when the next step is a slide). */
  tie(until: number) {
    this.gateOpenUntil = until;
    try {
      this.amp.gain.cancelScheduledValues(until - 0.0005);
      this.subAmp.gain.cancelScheduledValues(until - 0.0005);
    } catch {
      /* ignore */
    }
  }

  /** Live play from the field (Bass mode). x = cutoff, y = pitch. */
  live(on: boolean, midi: number, x: number, pressure: number) {
    const now = this.ctx.currentTime;
    const f = hz(clamp(midi, 16, 72));
    if (on) {
      const level = this.settings.level * (0.6 + pressure * 0.4) * 0.9;
      const oscs = [this.sub, this.mid, this.acid, this.reeseA, this.reeseB];
      for (const o of oscs) setTarget(o.frequency, f, now, this.liveOn ? 0.04 : 0.001);
      if (!this.liveOn) {
        setTarget(this.amp.gain, level, now, 0.004);
        setTarget(this.subAmp.gain, level, now, 0.006);
        const base = this.baseCutoff();
        const peak = clamp(base * Math.pow(2, this.settings.envMod * 3.4), 60, 14000);
        for (const fl of [this.acidF1, this.acidF2]) {
          fl.frequency.cancelScheduledValues(now);
          fl.frequency.setTargetAtTime(peak, now, 0.002);
        }
      } else {
        setTarget(this.amp.gain, level, now, 0.03);
        setTarget(this.subAmp.gain, level, now, 0.03);
      }
      const cut = clamp(70 * Math.pow(2, clamp01(x) * 7), 60, 12000);
      for (const fl of [this.acidF1, this.acidF2]) setTarget(fl.frequency, cut, now, this.liveOn ? 0.05 : 0.12);
      setTarget(this.reeseF.frequency, 200 + clamp01(x) * 3000, now, 0.05);
      this.liveOn = true;
      this.lastFreq = f;
    } else if (this.liveOn) {
      setTarget(this.amp.gain, 0, now, 0.05);
      setTarget(this.subAmp.gain, 0, now, 0.07);
      setTarget(this.reeseF.frequency, 260 + this.settings.cutoff * 2400, now, 0.1);
      this.liveOn = false;
    }
  }

  /** Visual envelope estimate (cheap; no analyser per voice). */
  tickFeatures(dt: number) {
    const target = this.liveOn || this.ctx.currentTime < this.gateOpenUntil ? 1 : 0;
    const b = features.bassVoice;
    b.env += (target - b.env) * (1 - Math.exp(-dt / (target > b.env ? 0.01 : 0.12)));
    b.hz = this.lastFreq;
    b.cutoff = this.settings.cutoff;
  }

  dispose() {
    const t = this.ctx.currentTime;
    for (const s of this.sources) {
      try {
        s.stop(t + 0.1);
      } catch {
        /* already */
      }
    }
    const nodes = this.nodes;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* gone */
        }
      }
    }, 250);
  }
}
