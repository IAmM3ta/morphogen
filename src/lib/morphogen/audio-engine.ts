import { runtime } from "./runtime";
import { DEFAULT_WAVEFORM, paletteById, paletteTone, type Brush, type WaveformId } from "./presets";
import {
  HUM_X64,
  SCHUMANN,
  keyById,
  modeById,
  tonicHz,
  yToScaleHz,
} from "./theory";
import { MAX_LOOPS, pickAudioRecorderMime, type LoopClip } from "./loops";

function ramp(param: AudioParam, value: number, now: number, t = 0.05) {
  if (!Number.isFinite(value) || !Number.isFinite(now) || !Number.isFinite(t) || t <= 0) return;
  try {
    param.setTargetAtTime(value, now, t);
  } catch {
    /* never throw out of the audio tick */
  }
}

/**
 * Earth-ionosphere cavity fundamental (Schumann).
 * Re-exported from theory so call sites keep working.
 */
export { SCHUMANN } from "./theory";

type HumTarget = { hz: number; amp: number };

/**
 * Phone-first chant: silent until a finger. Then a low overtone drone
 * (harmonics 1, 2, 3, 5, 9 — Tibetan low-voice formants) in the current key.
 * No major triad, no always-on pad.
 */
function humTargets(): HumTarget[] {
  const key = keyById(runtime.keyId);
  const tonic = tonicHz(key.pc, runtime.pitchMinHz, runtime.pitchMaxHz);
  const stops =
    runtime.liveStops ??
    (runtime.params.paletteId === "image" && runtime.customPalette
      ? runtime.customPalette.stops
      : paletteById(runtime.params.paletteId).stops);
  const tone = paletteTone(stops);
  const felt = SCHUMANN;
  const air = 0.55 + tone.lum * 0.45;
  return [
    { hz: felt, amp: 0.012 },
    { hz: tonic, amp: 0.2 },
    { hz: tonic * 2, amp: 0.14 * air },
    { hz: tonic * 3, amp: 0.09 * air },
    { hz: tonic * 5, amp: 0.07 * (0.6 + tone.sat) },
    { hz: tonic * 9, amp: 0.035 * air },
  ].map((p) => ({
    hz: Math.max(felt, Math.min(HUM_X64 * 4, p.hz || felt)),
    amp: Math.max(0.0008, p.amp),
  }));
}

/** Overtone series of a throat-sung / Maha Mrityunjaya voice. */
function chantWave(ctx: AudioContext): PeriodicWave {
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const boost: Record<number, number> = {
    1: 0.72,
    2: 0.52,
    3: 0.3,
    4: 0.1,
    5: 0.36,
    6: 0.05,
    7: 0.09,
    8: 0.06,
    9: 0.2,
  };
  for (let k = 1; k < n; k++) {
    imag[k] = boost[k] ?? 0.4 / Math.pow(k, 1.4);
  }
  return ctx.createPeriodicWave(real, imag);
}

function pulseWave(ctx: AudioContext, duty = 0.18, n = 64): PeriodicWave {
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
  sine: 0.56,
  triangle: 0.72,
  sawtooth: 0.48,
  square: 0.42,
  pulse: 0.46,
  spectrum: 0.64,
};

type Shape = {
  oscMix: number;
  detMix: number;
  harmMix: number;
  subMix: number;
  harmRatio: number;
  cutoff: number;
  q: number;
  fm: number;
  detuneSpread: number;
};

const SHAPE: Record<WaveformId, Shape> = {
  sine: { oscMix: 0.7, detMix: 0.3, harmMix: 0.1, subMix: 0.22, harmRatio: 2, cutoff: 920, q: 1.15, fm: 0.06, detuneSpread: 0.005 },
  triangle: { oscMix: 0.58, detMix: 0.22, harmMix: 0.16, subMix: 0.14, harmRatio: 3, cutoff: 2600, q: 0.7, fm: 0.35, detuneSpread: 0.004 },
  sawtooth: { oscMix: 0.72, detMix: 0.16, harmMix: 0.22, subMix: 0.2, harmRatio: 2, cutoff: 6800, q: 0.35, fm: 0.85, detuneSpread: 0.007 },
  square: { oscMix: 0.55, detMix: 0.06, harmMix: 0.2, subMix: 0.32, harmRatio: 3, cutoff: 4600, q: 1.15, fm: 0.28, detuneSpread: 0.003 },
  pulse: { oscMix: 0.66, detMix: 0.1, harmMix: 0.1, subMix: 0.18, harmRatio: 2, cutoff: 5200, q: 1.55, fm: 0.55, detuneSpread: 0.005 },
  spectrum: { oscMix: 0.8, detMix: 0.04, harmMix: 0.12, subMix: 0.12, harmRatio: 2, cutoff: 6000, q: 0.55, fm: 1, detuneSpread: 0.006 },
};

function applyOscShape(osc: OscillatorNode, wave: WaveformId, pulse: PeriodicWave | null, spec: PeriodicWave | null, chant: PeriodicWave | null) {
  if (wave === "sine" && chant) osc.setPeriodicWave(chant);
  else if (wave === "pulse" && pulse) osc.setPeriodicWave(pulse);
  else if (wave === "spectrum" && spec) osc.setPeriodicWave(spec);
  else if (wave === "triangle" || wave === "sawtooth" || wave === "square") osc.type = wave;
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
  gain: GainNode;
};

type LoopVoice = {
  clip: LoopClip;
  source: AudioBufferSourceNode;
  gain: GainNode;
  buffer: AudioBuffer;
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private leadBus: GainNode | null = null;
  private loopBus: GainNode | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private tiltFilter: BiquadFilterNode | null = null;
  private hum: HumPartial[] = [];
  private humBus: GainNode | null = null;
  private humPan: StereoPannerNode | null = null;
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
  private noiseBuf: AudioBuffer | null = null;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private pulse: PeriodicWave | null = null;
  private spec: PeriodicWave | null = null;
  private chant: PeriodicWave | null = null;
  private formant: BiquadFilterNode | null = null;
  private specTick = 0;
  private loops = new Map<string, LoopVoice>();
  private layerRec: MediaRecorder | null = null;
  private layerChunks: Blob[] = [];
  private loopSeq = 0;
  private voicedUntil = 0;
  onLoops: ((clips: LoopClip[], recording: boolean) => void) | null = null;
  volume = 0.7;
  muted = false;
  enabled = false;
  lastHz = 146.83;
  voiceCount = 0;
  private ctxHooked = false;
  private resumePromise: Promise<void> | null = null;
  private lastResumeAt = 0;

  unlock() {
    if (this.ctx?.state === "closed") {
      this.ctx = null;
      this.hum = [];
      this.ctxHooked = false;
      this.resumePromise = null;
    }
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.buildGraph();
      this.hookContext();
    }
    this.enabled = true;
    this.punchMaster();
    this.resume();
  }

  private hookContext() {
    const ctx = this.ctx;
    if (!ctx || this.ctxHooked) return;
    this.ctxHooked = true;
    const wake = () => {
      if (this.enabled) this.resume();
    };
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("touchstart", wake, { passive: true });
    window.addEventListener("keydown", wake);
  }

  /** Snapshot for the probe / HUD. */
  contextState(): string {
    return this.ctx?.state ?? "none";
  }

  private buildGraph() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.leadBus = ctx.createGain();
    this.leadBus.gain.value = 1;
    this.loopBus = ctx.createGain();
    this.loopBus.gain.value = 1;

    this.tiltFilter = ctx.createBiquadFilter();
    this.tiltFilter.type = "lowpass";
    this.tiltFilter.frequency.value = 1800;
    this.tiltFilter.Q.value = 0.7;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -22;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 2.4;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.28;

    this.delay = ctx.createDelay(1.8);
    this.delay.delayTime.value = 0.62;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.08;
    this.echo = ctx.createDelay(0.5);
    this.echo.delayTime.value = 0.28;
    this.echoGain = ctx.createGain();
    this.echoGain.gain.value = 0.06;

    this.bus.connect(this.tiltFilter);
    this.tiltFilter.connect(this.delay);
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.tiltFilter);
    this.tiltFilter.connect(this.echo);
    this.echo.connect(this.echoGain);
    this.echoGain.connect(this.tiltFilter);
    this.tiltFilter.connect(this.compressor);
    this.leadBus.connect(this.compressor);
    this.loopBus.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);
    this.capture = ctx.createMediaStreamDestination();
    this.master.connect(this.capture);
    this.recDest = ctx.createMediaStreamDestination();
    this.leadBus.connect(this.recDest);
    this.loopBus.connect(this.recDest);

    this.humBus = ctx.createGain();
    this.humBus.gain.value = 0;
    this.formant = ctx.createBiquadFilter();
    this.formant.type = "bandpass";
    this.formant.frequency.value = 390;
    this.formant.Q.value = 1.35;
    this.humPan = ctx.createStereoPanner();
    this.humPan.pan.value = 0;
    this.humBus.connect(this.formant);
    this.formant.connect(this.humPan);
    this.humPan.connect(this.bus);
    try {
      this.chant = chantWave(ctx);
    } catch {
      this.chant = null;
    }
    this.hum = humTargets().map((p) => {
      const osc = ctx.createOscillator();
      if (this.chant) osc.setPeriodicWave(this.chant);
      else osc.type = "sine";
      osc.frequency.value = p.hz;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.humBus!);
      osc.start();
      return { osc, gain, hz: p.hz, amp: p.amp };
    });

    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.13;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 14;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.formant.frequency);
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
    this.punchMaster();
  }

  private masterGainTarget() {
    if (!this.enabled || this.muted) return 0;
    const v = Number.isFinite(this.volume) ? Math.max(0, Math.min(1, this.volume)) : 0.7;
    return v * v;
  }

  /** WebKit drops setTargetAtTime scheduled while suspended; write the value. */
  private punchMaster() {
    if (!this.master) return;
    const g = this.masterGainTarget();
    try {
      this.master.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
      this.master.gain.value = g;
    } catch {
      /* ignore */
    }
  }

  captureStream(): MediaStream | null {
    return this.capture?.stream ?? null;
  }

  getLoops(): LoopClip[] {
    return [...this.loops.values()].map((v) => ({ ...v.clip }));
  }

  get layerRecording() {
    return Boolean(this.layerRec && this.layerRec.state === "recording");
  }

  private emitLoops() {
    this.onLoops?.(this.getLoops(), this.layerRecording);
  }

  startLayerRecord(): boolean {
    if (!this.ctx || !this.recDest || this.layerRecording) return false;
    if (this.loops.size >= MAX_LOOPS) return false;
    if (typeof MediaRecorder === "undefined") return false;
    const mime = pickAudioRecorderMime();
    this.layerChunks = [];
    try {
      this.layerRec = mime
        ? new MediaRecorder(this.recDest.stream, { mimeType: mime })
        : new MediaRecorder(this.recDest.stream);
    } catch {
      this.layerRec = null;
      return false;
    }
    this.layerRec.ondataavailable = (e) => {
      if (e.data.size > 0) this.layerChunks.push(e.data);
    };
    this.layerRec.onerror = () => {
      this.layerRec = null;
      this.emitLoops();
    };
    this.layerRec.start(120);
    this.emitLoops();
    return true;
  }

  async stopLayerRecord(): Promise<LoopClip | null> {
    const rec = this.layerRec;
    if (!rec || rec.state === "inactive") {
      this.layerRec = null;
      this.emitLoops();
      return null;
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        resolve(this.layerChunks.length ? new Blob(this.layerChunks, { type }) : null);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
    this.layerRec = null;
    this.layerChunks = [];
    if (!blob || !this.ctx) {
      this.emitLoops();
      return null;
    }
    try {
      const buffer = await this.ctx.decodeAudioData(await blob.arrayBuffer());
      return this.armLoop(buffer);
    } catch {
      this.emitLoops();
      return null;
    }
  }

  private armLoop(buffer: AudioBuffer): LoopClip {
    const ctx = this.ctx!;
    this.loopSeq += 1;
    const clip: LoopClip = {
      id: `L${this.loopSeq}`,
      name: `Layer ${this.loopSeq}`,
      duration: buffer.duration,
      looping: true,
      playing: true,
      createdAt: Date.now(),
    };
    const gain = ctx.createGain();
    gain.gain.value = 0.85;
    gain.connect(this.loopBus!);
    const source = this.spawnLoopSource(buffer, gain, true);
    this.loops.set(clip.id, { clip, source, gain, buffer });
    this.emitLoops();
    return clip;
  }

  private spawnLoopSource(buffer: AudioBuffer, gain: GainNode, loop: boolean): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain);
    source.start();
    return source;
  }

  setLoopPlaying(id: string, playing: boolean) {
    const v = this.loops.get(id);
    if (!v || !this.ctx) return;
    try {
      v.source.stop();
    } catch {
      /* already */
    }
    v.clip.playing = playing;
    if (playing) v.source = this.spawnLoopSource(v.buffer, v.gain, v.clip.looping);
    this.emitLoops();
  }

  setLoopLooping(id: string, looping: boolean) {
    const v = this.loops.get(id);
    if (!v) return;
    v.clip.looping = looping;
    v.source.loop = looping;
    if (v.clip.playing && !looping) {
      v.source.onended = () => {
        v.clip.playing = false;
        this.emitLoops();
      };
    }
    this.emitLoops();
  }

  removeLoop(id: string) {
    const v = this.loops.get(id);
    if (!v) return;
    try {
      v.source.stop();
    } catch {
      /* already */
    }
    try {
      v.gain.disconnect();
    } catch {
      /* already */
    }
    this.loops.delete(id);
    this.emitLoops();
  }

  clearLoops() {
    for (const id of [...this.loops.keys()]) this.removeLoop(id);
  }

  setVolume(v: number) {
    this.volume = Number.isFinite(v) ? v : 0.7;
    this.punchMaster();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.punchMaster();
  }

  resume() {
    if (!this.enabled) return;
    if (this.ctx?.state === "closed") {
      this.unlock();
      return;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "running") {
      this.punchMaster();
      return;
    }
    const now = performance.now();
    if (this.resumePromise) return;
    if (now - this.lastResumeAt < 400) return;
    this.lastResumeAt = now;
    this.resumePromise = ctx
      .resume()
      .then(() => {
        this.resumePromise = null;
        this.punchMaster();
      })
      .catch(() => {
        this.resumePromise = null;
      });
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
    const shape = SHAPE[wave];
    applyOscShape(v.osc, wave, this.pulse, this.spec, this.chant);
    applyOscShape(v.detune, wave === "sine" ? "sine" : wave, this.pulse, this.spec, this.chant);
    v.harm.type = wave === "square" || wave === "sawtooth" ? wave : "sine";
    v.sub.type = wave === "square" ? "square" : "sine";
    v.wave = wave;
    const now = this.ctx?.currentTime ?? 0;
    ramp(v.oscG.gain, shape.oscMix, now, 0.04);
    ramp(v.detG.gain, shape.detMix, now, 0.04);
    ramp(v.harmG.gain, shape.harmMix, now, 0.04);
    ramp(v.subG.gain, shape.subMix, now, 0.04);
    v.filter.Q.value = shape.q;
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
    gate.connect(this.leadBus!);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = HUM_X64;
    const oscG = ctx.createGain();
    oscG.gain.value = 0.4;
    osc.connect(oscG);
    oscG.connect(mix);

    const detune = ctx.createOscillator();
    detune.type = "sine";
    detune.frequency.value = HUM_X64 * 1.003;
    const detG = ctx.createGain();
    detG.gain.value = 0.22;
    detune.connect(detG);
    detG.connect(mix);

    const harm = ctx.createOscillator();
    harm.type = "sine";
    harm.frequency.value = HUM_X64 * 2;
    const harmG = ctx.createGain();
    harmG.gain.value = 0.06;
    harm.connect(harmG);
    harmG.connect(mix);

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = HUM_X64 * 0.5;
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
    ramp(v.mix.gain, 0.0001, now, 0.22);
    const stopAt = now + 1.15;
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
    }, 1300);
    this.live.delete(id);
  }

  private driveVoice(v: LiveVoice, x: number, y: number, pressure: number, radius: number, now: number) {
    const wave = runtime.waveform;
    if (v.wave !== wave) this.applyWave(v, wave);
    const sense = runtime.sense;
    const key = keyById(runtime.keyId);
    const mode = modeById(runtime.modeId);
    const shape = SHAPE[wave];
    const hzRaw = yToScaleHz(
      y,
      sense.pitch,
      key.pc,
      mode.intervals,
      wave === "sine" ? 0.7 : 0.9,
      runtime.pitchMinHz,
      runtime.pitchMaxHz,
    );
    const lo = Math.min(runtime.pitchMinHz, runtime.pitchMaxHz);
    const hi = Math.max(runtime.pitchMinHz, runtime.pitchMaxHz);
    const hz = Number.isFinite(hzRaw) ? Math.max(lo, Math.min(hi, hzRaw)) : Math.max(lo, Math.min(hi, HUM_X64));
    this.lastHz = hz;
    const stops =
      runtime.liveStops ??
      (runtime.params.paletteId === "image" && runtime.customPalette
        ? runtime.customPalette.stops
        : paletteById(runtime.params.paletteId).stops);
    const tone = paletteTone(stops);
    const amp =
      (0.04 + x * 0.72 + pressure * 0.18 + radius * 0.06) *
      (0.82 + Math.min(1, sense.gforce) * 0.22) *
      LOUD[wave];
    const cutoff =
      (shape.cutoff * 0.55 +
        pressure * 1800 +
        x * 900 +
        (sense.pitch + 1) * 500 +
        runtime.stats.edge * 240) *
      (wave === "sine" ? 0.7 : 1) *
      (0.62 + tone.lum * 0.7 + tone.sat * 0.12);
    const vib = wave === "sine" ? 0.2 + sense.spin * 0.5 : 3.2 + sense.spin * 8.5 + Math.abs(sense.roll) * 1.2;
    const fmAmt = shape.fm * (wave === "sine" ? 2 + sense.spin * 4 : 4 + sense.spin * 28 + pressure * 10 + Math.abs(sense.pitch) * 5 + runtime.mic * 12);

    ramp(v.osc.frequency, hz, now, 0.045);
    ramp(v.detune.frequency, hz * (1 + shape.detuneSpread + sense.roll * 0.008), now, 0.05);
    ramp(v.harm.frequency, Math.min(1800, hz * shape.harmRatio), now, 0.08);
    ramp(v.sub.frequency, hz * 0.5, now, 0.08);
    ramp(v.fm.frequency, vib, now, 0.08);
    ramp(v.fmGain.gain, fmAmt, now, 0.08);
    ramp(v.filter.frequency, Math.max(160, Math.min(2400, cutoff)), now, 0.07);
    ramp(v.pan.pan, Math.max(-0.72, Math.min(0.72, sense.yaw * 0.4 + sense.roll * 0.5)), now, 0.06);
    ramp(v.mix.gain, Math.max(0.0001, Math.min(0.48, amp)), now, 0.08);
  }

  tick() {
    try {
      this.tickInner();
    } catch {
      /* never throw into the render loop */
    }
  }

  private tickInner() {
    if (!this.enabled) return;
    if (!this.ctx || this.ctx.state === "closed") {
      this.unlock();
      return;
    }
    if (this.ctx.state !== "running") {
      // Do not spam resume() from rAF — Safari/WKWebView sticks suspended.
      return;
    }
    if (!this.humBus || !this.humPan || !this.lfo || !this.lfoGain || !this.noiseFilter || !this.noiseGain || !this.tiltFilter || !this.delayGain)
      return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.punchMaster();
    const s = runtime.stats;
    const energy = s.energy;
    const v = s.meanV;
    const edge = s.edge;
    const sense = runtime.sense;
    this.readMic();

    if (runtime.waveform === "spectrum") {
      this.specTick = (this.specTick + 1) % 4;
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

    const touching = this.live.size > 0 || this.frozen.length > 0;
    if (touching) this.voicedUntil = now + 2.6;
    const voiced = now < this.voicedUntil;
    const tilt = sense.pitch;
    const roll = sense.roll;
    const spin = sense.spin;
    const gf = Math.min(1.4, sense.gforce);
    const humLevel = voiced ? 0.32 + energy * 0.08 + Math.max(0, -tilt) * 0.06 : 0;
    ramp(this.humBus.gain, humLevel, now, voiced ? 0.18 : 0.55);
    ramp(this.humPan.pan, Math.max(-0.55, Math.min(0.55, roll * 0.45 + sense.yaw * 0.22)), now, 0.12);
    ramp(this.lfo.frequency, 0.11 + spin * 0.35, now, 0.14);
    ramp(this.lfoGain.gain, voiced ? 12 + Math.abs(roll) * 6 : 4, now, 0.2);
    if (this.formant) {
      const stops =
        runtime.liveStops ??
        (runtime.params.paletteId === "image" && runtime.customPalette
          ? runtime.customPalette.stops
          : paletteById(runtime.params.paletteId).stops);
      const tone = paletteTone(stops);
      ramp(this.formant.frequency, 320 + tone.lum * 220 + tone.hue * 60, now, 0.16);
      this.formant.Q.value = 1.15 + tone.sat * 0.5;
    }

    const targets = humTargets();
    if (this.live.size === 0) this.lastHz = targets[1]?.hz ?? 146.83;
    for (let i = 0; i < this.hum.length; i++) {
      const p = this.hum[i]!;
      const t = targets[i] ?? targets[targets.length - 1]!;
      const amp = voiced ? t.amp * (0.9 + energy * 0.15) : 0.0008;
      ramp(p.osc.frequency, t.hz, now, 0.12);
      ramp(p.gain.gain, amp, now, voiced ? 0.16 : 0.5);
      p.hz = t.hz;
      p.amp = t.amp;
    }

    ramp(this.noiseFilter.frequency, 90, now, 0.08);
    ramp(this.noiseGain.gain, 0, now, 0.08);

    const tiltCut = 720 + (tilt + 1) * 420 + energy * 280 + v * 120 + this.live.size * 80;
    ramp(this.tiltFilter.frequency, Math.max(280, Math.min(2200, tiltCut)), now, 0.12);
    ramp(this.delayGain.gain, voiced ? Math.min(0.2, 0.12 + Math.abs(roll) * 0.08) : 0.05, now, 0.16);
    if (this.echoGain) ramp(this.echoGain.gain, voiced ? 0.08 + spin * 0.06 : 0.03, now, 0.16);
  }

  lockLoop(): number {
    if (!this.ctx || !this.master || !this.enabled) return this.frozen.length;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.frozen.length >= 4) this.releaseVoice(this.frozen.shift()!, now);

    const dest = this.loopBus ?? this.master;
    const gain = ctx.createGain();
    const n = this.frozen.length + 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.04, 0.12 / n), now + 0.14);
    gain.connect(dest);

    const key = keyById(runtime.keyId);
    const lo = runtime.pitchMinHz;
    const hi = runtime.pitchMaxHz;
    const tonic = tonicHz(key.pc, lo, hi);
    let root = this.lastHz > SCHUMANN ? this.lastHz : tonic;
    if (!Number.isFinite(root) || root < SCHUMANN) root = tonic;
    root = Math.max(lo, Math.min(hi, root));
    this.lastHz = root;

    const freqs = [root];
    if (root * 2 <= hi * 1.02) freqs.push(root * 2);
    const osc: OscillatorNode[] = [];
    const wave = runtime.waveform;
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      applyOscShape(o, wave === "spectrum" ? "sine" : wave, this.pulse, this.spec, this.chant);
      o.frequency.value = freqs[i]!;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.28 : 0.07;
      o.connect(og);
      og.connect(gain);
      o.start(now);
      osc.push(o);
    }

    this.frozen.push({ osc, gain });
    return this.frozen.length;
  }

  popLock(): number {
    if (!this.ctx || this.frozen.length === 0) return 0;
    this.releaseVoice(this.frozen.pop()!, this.ctx.currentTime);
    return this.frozen.length;
  }

  clearLocks() {
    if (!this.ctx) {
      this.frozen = [];
      return;
    }
    const now = this.ctx.currentTime;
    while (this.frozen.length) this.releaseVoice(this.frozen.pop()!, now);
  }

  private releaseVoice(v: FrozenVoice, now: number) {
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      const stopAt = now + 0.32;
      for (const o of v.osc) o.stop(stopAt);
      window.setTimeout(() => {
        try {
          v.gain.disconnect();
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
    this.clearLoops();
    if (this.layerRec && this.layerRec.state !== "inactive") {
      try {
        this.layerRec.stop();
      } catch {
        /* already */
      }
    }
    this.layerRec = null;
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
