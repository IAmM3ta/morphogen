/**
 * Sound engine v2: Drone Synth, refined bass, drums, transport and the loop
 * builder, sharing the instrument's existing AudioContext.
 *
 *   drone ─→ HP (moves up when bass plays) ─┐
 *   bass  ────────────────────────────────── ├→ duck (sidechain from kick) ─┐
 *   drums ───────────────────────────────────────────────────────────────── ├→ glue comp → out → host master
 *                                                                            (host: limiter + soft clip)
 */
import { BassSynth, DEFAULT_BASS, type BassSettings } from "./bass";
import { control, type ControlState } from "./control";
import { DEFAULT_DRONE, DroneSynth, type DroneSettings } from "./drone";
import { DrumKit } from "./drums";
import { features, noteHit, pushRipple } from "./features";
import {
  AUTO_RES,
  DRUM_LANES,
  SCENES,
  STEPS,
  clonePattern,
  emptyAuto,
  emptyPattern,
  factoryLoop,
  laneAudible,
  loadLoop,
  resizeAuto,
  saveLoop,
  type DrumLane,
  type LaneId,
  type LoopState,
  type Pattern,
  type SceneId,
} from "./loop";
import { degreeToMidi, positionToMidi, rootIn, scaleNotes } from "./music";
import { setTarget, softClipCurve } from "./dsp";
import { Transport, type StepEvent } from "./transport";
import { encodeWav } from "./wav";
import { clamp01 } from "./smoothing";

export type Mode = "field" | "drone" | "bass" | "loop";

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "field", label: "Field", hint: "Touch the field to hear it. Drag to plant growth." },
  { id: "drone", label: "Drone", hint: "Slide up for pitch, sideways for brightness. Tilt the phone to open the filter." },
  { id: "bass", label: "Bass", hint: "Your finger plays the bass. Tap steps to write a line." },
  { id: "loop", label: "Loop", hint: "Press Play. Arm the drone lane, then play to record it into the loop." },
];

type Rig = {
  ctx: BaseAudioContext;
  out: GainNode;
  glue: DynamicsCompressorNode;
  duck: GainNode;
  droneHp: BiquadFilterNode;
  drone: DroneSynth;
  bass: BassSynth;
  drums: DrumKit;
  /** What the "Loop" layer recorder should hear (the performed drone). */
  perform: GainNode;
};

function buildRig(ctx: BaseAudioContext, dest: AudioNode): Rig {
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(dest);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -14;
  glue.knee.value = 6;
  glue.ratio.value = 3;
  glue.attack.value = 0.01;
  glue.release.value = 0.2;
  glue.connect(out);
  const duck = ctx.createGain();
  duck.gain.value = 1;
  duck.connect(glue);
  const droneHp = ctx.createBiquadFilter();
  droneHp.type = "highpass";
  droneHp.frequency.value = 30;
  droneHp.Q.value = 0.6;
  droneHp.connect(duck);
  const perform = ctx.createGain();
  perform.connect(droneHp);
  const drone = new DroneSynth(ctx, perform);
  const bass = new BassSynth(ctx, duck);
  const drums = new DrumKit(ctx, glue);
  return { ctx, out, glue, duck, droneHp, drone, bass, drums, perform };
}

function duckAt(rig: Rig, time: number, depth: number) {
  if (depth <= 0.01) return;
  try {
    const g = rig.duck.gain;
    g.cancelScheduledValues(time);
    g.setTargetAtTime(1 - depth * 0.75, time, 0.004);
    g.setTargetAtTime(1, time + 0.05, 0.09);
  } catch {
    /* ignore */
  }
}

function bassRoot() {
  return rootIn(33);
}

function percMidi(step: number) {
  const notes = scaleNotes(72, 90);
  if (!notes.length) return 76;
  return notes[(step * 5) % notes.length]!;
}

/** Shared by live playback and offline export. */
function scheduleStep(rig: Rig, state: LoopState, p: Pattern, e: StepEvent, opts: { skipBass?: boolean; duck: number }) {
  for (const lane of DRUM_LANES) {
    const v = p[lane][e.step] ?? 0;
    if (!v || !laneAudible(state, lane)) continue;
    const vel = lane === "hat" ? (v === 2 ? 0.75 : 0.55) : v === 2 ? 1 : 0.78;
    rig.drums.trigger(lane, e.time, vel, v, percMidi(e.step));
    if (lane === "kick") duckAt(rig, e.time, opts.duck);
  }
  if (!opts.skipBass && laneAudible(state, "bass")) {
    const b = p.bass[e.step];
    if (b?.on) {
      const next = p.bass[(e.step + 1) % STEPS];
      const tie = b.slide && Boolean(next?.on);
      rig.bass.trigger(
        { midi: degreeToMidi(b.degree, bassRoot()), accent: b.accent, slide: (p.bass[(e.step + STEPS - 1) % STEPS]?.slide ?? false) && b.on, gate: tie ? 1.08 : 0.55 },
        e.time,
        e.dur,
      );
    }
  }
}

export type SoundV2Snapshot = {
  version: number;
  playing: boolean;
  step: number;
  recArmed: boolean;
  recording: boolean;
  overdub: boolean;
  bassRec: boolean;
  queued: SceneId | null;
  canUndo: boolean;
  hold: boolean;
  shimmer: boolean;
};

export class SoundV2 {
  private rig: Rig;
  readonly transport: Transport;
  loop: LoopState;
  mode: Mode = "field";
  hold = false;
  duckDepth = 0.55;
  private undoStack: string[] = [];
  private queued: SceneId | null = null;
  private recArmed = false;
  private recording = false;
  private recStartPos = 0;
  private recLastSlot = -1;
  private recCovered = 0;
  overdub = false;
  bassRec = false;
  private lastBassStepWritten = -1;
  private listeners = new Set<() => void>();
  private version = 0;
  private saveTimer = 0;
  private uiStep = -1;
  private snapshot: SoundV2Snapshot;
  private disposed = false;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    private recordTap: AudioNode | null,
    private onHandsVoiced: (voiced: boolean) => void,
  ) {
    this.rig = buildRig(ctx, dest);
    if (recordTap) {
      try {
        this.rig.perform.connect(recordTap);
      } catch {
        /* optional */
      }
    }
    this.loop = loadLoop();
    this.transport = new Transport(ctx);
    this.transport.setBpm(this.loop.bpm);
    this.transport.swing = this.loop.swing;
    this.transport.onStep = (e) => this.onStep(e);
    this.transport.onTick = (now) => this.onTick(now);
    this.rig.bass.setSettings({ style: this.loop.bassStyle });
    this.rig.drums.onKick = (time, v) => {
      const ms = Math.max(0, (time - this.ctx.currentTime) * 1000);
      window.setTimeout(() => {
        noteHit("kick", v);
        pushRipple(0.5, 0.5, 0.35 * v);
      }, ms);
    };
    this.snapshot = this.makeSnapshot();
    void this.rig.drone.attachShimmer().then(() => this.emit());
  }

  // ───────── subscription (React useSyncExternalStore) ─────────
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  private makeSnapshot(): SoundV2Snapshot {
    return {
      version: this.version,
      playing: this.transport.playing,
      step: this.uiStep,
      recArmed: this.recArmed,
      recording: this.recording,
      overdub: this.overdub,
      bassRec: this.bassRec,
      queued: this.queued,
      canUndo: this.undoStack.length > 0,
      hold: this.hold,
      shimmer: this.rig.drone.hasShimmer,
    };
  }
  private emit() {
    this.version += 1;
    this.snapshot = this.makeSnapshot();
    for (const fn of this.listeners) fn();
  }
  private changed(persist = true) {
    this.emit();
    if (!persist) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => saveLoop(this.loop), 350);
  }

  // ───────── modes & settings ─────────
  setMode(m: Mode) {
    this.mode = m;
    this.onHandsVoiced(m === "field");
    if (m !== "bass") this.rig.bass.live(false, 40, 0.5, 0);
    this.emit();
  }
  setHold(on: boolean) {
    this.hold = on;
    this.emit();
  }
  setDrone(p: Partial<DroneSettings>) {
    this.rig.drone.setSettings(p);
  }
  setBass(p: Partial<BassSettings>) {
    this.rig.bass.setSettings(p);
    if (p.style && p.style !== this.loop.bassStyle) {
      this.loop.bassStyle = p.style;
      this.changed();
    }
  }
  get droneState() {
    return this.rig.drone.state;
  }

  // ───────── transport ─────────
  togglePlay() {
    if (this.transport.playing) this.stop();
    else this.play();
  }
  play() {
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    this.transport.start();
    this.rig.drone.syncDelay(this.loop.bpm);
    features.playing = true;
    this.emit();
  }
  stop() {
    this.transport.stop();
    this.recording = false;
    this.recArmed = false;
    this.uiStep = -1;
    this.rig.drone.syncDelay(null);
    features.playing = false;
    this.emit();
  }
  setBpm(bpm: number) {
    this.transport.setBpm(bpm);
    this.loop.bpm = this.transport.bpm;
    if (this.transport.playing) this.rig.drone.syncDelay(this.loop.bpm);
    this.changed();
  }
  setSwing(s: number) {
    this.loop.swing = Math.max(0, Math.min(0.6, s));
    this.transport.swing = this.loop.swing;
    this.changed();
  }

  // ───────── editing (all undoable) ─────────
  private commit() {
    this.undoStack.push(JSON.stringify(this.loop));
    if (this.undoStack.length > 40) this.undoStack.shift();
  }
  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    try {
      this.loop = JSON.parse(prev) as LoopState;
      this.transport.setBpm(this.loop.bpm);
      this.transport.swing = this.loop.swing;
      this.changed();
      return true;
    } catch {
      return false;
    }
  }
  get pattern(): Pattern {
    return this.loop.scenes[this.loop.scene];
  }
  cycleDrum(lane: DrumLane, step: number) {
    this.commit();
    const cur = this.pattern[lane][step] ?? 0;
    this.pattern[lane][step] = (cur + 1) % 3;
    this.changed();
  }
  toggleBassStep(step: number) {
    this.commit();
    const b = this.pattern.bass[step]!;
    b.on = !b.on;
    this.changed();
  }
  editBassStep(step: number, patch: Partial<{ degree: number; accent: boolean; slide: boolean; on: boolean }>) {
    this.commit();
    const b = this.pattern.bass[step]!;
    Object.assign(b, patch);
    b.degree = Math.max(-7, Math.min(14, Math.round(b.degree)));
    this.changed();
  }
  setMute(lane: LaneId, on: boolean) {
    this.loop.mute[lane] = on;
    this.changed();
  }
  setSolo(lane: LaneId | null) {
    this.loop.solo = this.loop.solo === lane ? null : lane;
    this.changed();
  }
  clearLane(lane: LaneId) {
    this.commit();
    const p = this.pattern;
    if (lane === "bass") p.bass = emptyPattern().bass;
    else if (lane === "drone") p.auto = emptyAuto(p.auto.bars);
    else p[lane] = Array(STEPS).fill(0);
    this.changed();
  }
  clearScene() {
    this.commit();
    this.loop.scenes[this.loop.scene] = emptyPattern();
    this.changed();
  }
  resetFactory() {
    this.commit();
    const f = factoryLoop();
    this.loop = f;
    this.transport.setBpm(f.bpm);
    this.transport.swing = f.swing;
    this.changed();
  }
  duplicateTo(target: SceneId) {
    this.commit();
    this.loop.scenes[target] = clonePattern(this.pattern);
    this.changed();
  }
  /** Scene change is quantised to the next bar while playing. */
  launchScene(id: SceneId) {
    if (!this.transport.playing) {
      this.loop.scene = id;
      this.queued = null;
      this.changed();
      return;
    }
    this.queued = id === this.loop.scene ? null : id;
    this.emit();
  }
  setAutoBars(bars: 1 | 2 | 4) {
    this.commit();
    this.pattern.auto = resizeAuto(this.pattern.auto, bars);
    this.changed();
  }

  // ───────── performance recording ─────────
  /** Arm drone automation recording; it starts on the next bar. */
  toggleRecord() {
    if (this.recording || this.recArmed) {
      this.recording = false;
      this.recArmed = false;
      this.emit();
      return;
    }
    if (!this.transport.playing) this.play();
    this.commit();
    this.recArmed = true;
    this.emit();
  }
  setOverdub(on: boolean) {
    this.overdub = on;
    this.emit();
  }
  toggleBassRec() {
    this.bassRec = !this.bassRec;
    if (this.bassRec) {
      this.commit();
      if (!this.transport.playing) this.play();
    }
    this.emit();
  }

  private onStep(e: StepEvent) {
    if (e.step === 0 && this.queued) {
      this.loop.scene = this.queued;
      this.queued = null;
      window.setTimeout(() => this.changed(), Math.max(0, (e.time - this.ctx.currentTime) * 1000));
    }
    if (e.step === 0 && this.recArmed) {
      const ms = Math.max(0, (e.time - this.ctx.currentTime) * 1000);
      window.setTimeout(() => {
        if (!this.recArmed) return;
        this.recArmed = false;
        this.recording = true;
        this.recStartPos = this.transport.loopPosition(this.ctx.currentTime, this.pattern.auto.bars);
        this.recLastSlot = -1;
        this.recCovered = 0;
        this.emit();
      }, ms);
    }
    const p = this.pattern;
    // Live bass step-writing from the finger (Bass mode, Rec on).
    const live = this.rig.bass.liveOn;
    if (this.bassRec && this.mode === "bass" && live) {
      const midi = this.liveBassMidi;
      const deg = this.midiToDegree(midi);
      const prev = p.bass[(e.step + STEPS - 1) % STEPS]!;
      p.bass[e.step] = {
        on: true,
        degree: deg,
        accent: control.pressure > 0.85,
        slide: prev.on && this.lastBassStepWritten === (e.step + STEPS - 1) % STEPS && prev.degree !== deg,
      };
      this.lastBassStepWritten = e.step;
      window.setTimeout(() => this.changed(), 0);
    }
    scheduleStep(this.rig, this.loop, p, e, { skipBass: live, duck: this.duckDepth });
    const ms = Math.max(0, (e.time - this.ctx.currentTime) * 1000);
    const step = e.step;
    window.setTimeout(() => {
      if (!this.transport.playing) return;
      this.uiStep = step;
      if (p.hat[step]) noteHit("hat", p.hat[step] === 2 ? 0.8 : 0.5);
      if (p.clap[step]) noteHit("clap", 0.8);
      if (p.perc[step]) noteHit("perc", 0.7);
      this.emit();
    }, ms);
  }

  private liveBassMidi = 40;
  private midiToDegree(midi: number): number {
    const root = bassRoot();
    let best = 0;
    let bestD = Infinity;
    for (let d = -7; d <= 14; d++) {
      const dd = Math.abs(degreeToMidi(d, root) - midi);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  /** Automation playback runs on the transport clock (survives hidden tabs). */
  private onTick(now: number) {
    const p = this.pattern;
    const a = p.auto;
    if (!a.used || !laneAudible(this.loop, "drone") || this.recording) return;
    if (control.active && (this.mode === "drone" || this.mode === "loop")) return;
    const pos = this.transport.loopPosition(now + 0.03, a.bars);
    const i = Math.floor(pos * AUTO_RES) % a.y.length;
    const g = a.g[i] ?? 0;
    this.autoPlaying = g > 0.001;
    this.rig.drone.perform(
      {
        gate: Math.max(g, this.hold ? 0.8 : 0),
        x: a.x[i] ?? 0.4,
        y: a.y[i] ?? 0.5,
        tiltX: control.tiltX,
        tiltY: control.tiltY,
        heading: control.heading,
        shake: control.shake,
        jolt: false,
      },
      now + 0.03,
    );
  }
  private autoPlaying = false;

  /** Per animation frame: route hands + sensors to the active voice. */
  frame(dt: number, c: ControlState) {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const playingAuto = this.transport.playing && this.pattern.auto.used && laneAudible(this.loop, "drone") && !this.recording;
    const droneHands = this.mode === "drone" || this.mode === "loop";
    const gate = droneHands && c.active ? 0.55 + 0.45 * clamp01(c.pressure) : this.hold ? 0.8 : 0;
    const handsOnDrone = droneHands && c.active;
    if (handsOnDrone || !playingAuto) {
      this.rig.drone.perform(
        { gate, x: c.x, y: c.y, tiltX: c.tiltX, tiltY: c.tiltY, heading: c.heading, shake: c.shake, jolt: c.jolt },
        now,
      );
    }
    // Bass mode: the finger is a mono acid theremin.
    if (this.mode === "bass") {
      const midi = positionToMidi(1 - c.y, 28, 52, 1);
      this.liveBassMidi = midi;
      this.rig.bass.live(c.active, midi, c.x, c.pressure);
    }
    // Low end yields to the bass when the bass lane sounds.
    const bassBusy = (this.transport.playing && laneAudible(this.loop, "bass") && this.pattern.bass.some((b) => b.on)) || this.rig.bass.liveOn;
    setTarget(this.rig.droneHp.frequency, bassBusy ? 110 : 30, now, 0.4);
    this.rig.bass.tickFeatures(dt);
    // Write automation while recording.
    if (this.recording) this.writeAutomation(now, c, gate);
    // Transport → features.
    const pos = this.transport.position(now);
    features.playing = this.transport.playing;
    features.bpm = this.loop.bpm;
    features.step = pos.step;
    features.bar = pos.bar;
    features.beatPhase = pos.beatPhase;
  }

  private writeAutomation(now: number, c: ControlState, gate: number) {
    const a = this.pattern.auto;
    const n = a.y.length;
    const pos = this.transport.loopPosition(now, a.bars);
    const slot = Math.floor(pos * AUTO_RES) % n;
    if (this.recLastSlot < 0) this.recLastSlot = (slot + n - 1) % n;
    let s = (this.recLastSlot + 1) % n;
    let guard = 0;
    const touching = c.active && (this.mode === "drone" || this.mode === "loop");
    while (guard++ < n) {
      if (!this.overdub || touching) {
        a.y[s] = c.y;
        a.x[s] = c.x;
        a.g[s] = touching ? gate : this.overdub ? (a.g[s] ?? 0) : 0;
        if (touching) a.used = true;
      }
      this.recCovered += 1;
      if (s === slot) break;
      s = (s + 1) % n;
    }
    this.recLastSlot = slot;
    // Replace mode stops after one full pass; overdub keeps layering.
    if (!this.overdub && this.recCovered >= n) {
      this.recording = false;
      this.changed();
    } else if (this.recCovered % 16 === 0) {
      this.emit();
    }
  }

  // ───────── export ─────────
  /** Offline-render the current scene (drums, bass, recorded drone) to WAV. */
  async exportWav(): Promise<Blob | null> {
    const OAC =
      typeof OfflineAudioContext !== "undefined"
        ? OfflineAudioContext
        : (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OAC) return null;
    const p = clonePattern(this.pattern);
    const state: LoopState = JSON.parse(JSON.stringify(this.loop)) as LoopState;
    const bars = Math.max(2, p.auto.used ? p.auto.bars * 2 : 4);
    const bpm = state.bpm;
    const stepDur = 60 / bpm / 4;
    const barDur = stepDur * STEPS;
    const tail = 3;
    const sr = 44100;
    const len = Math.ceil((bars * barDur + tail) * sr);
    const off = new OAC(2, len, sr);
    const limiter = off.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    const clip = off.createWaveShaper();
    clip.curve = softClipCurve(0.85);
    const master = off.createGain();
    master.gain.value = 0.9;
    master.connect(limiter);
    limiter.connect(clip);
    clip.connect(off.destination);
    const rig = buildRig(off, master);
    rig.bass.setSettings(this.rig.bass.settings);
    rig.drone.setSettings(this.rig.drone.settings);
    await rig.drone.attachShimmer().catch(() => false);
    const t0 = 0.05;
    for (let bar = 0; bar < bars; bar++) {
      for (let step = 0; step < STEPS; step++) {
        const swing = step % 2 === 1 ? state.swing * stepDur * 0.5 : 0;
        const time = t0 + bar * barDur + step * stepDur + swing;
        scheduleStep(rig, state, p, { step, bar, time, dur: stepDur }, { duck: this.duckDepth });
      }
    }
    if (p.auto.used && laneAudible(state, "drone")) {
      const n = p.auto.y.length;
      const slotDur = barDur / AUTO_RES;
      const total = Math.floor((bars * barDur) / slotDur);
      for (let k = 0; k < total; k++) {
        const i = k % n;
        rig.drone.perform(
          { gate: p.auto.g[i] ?? 0, x: p.auto.x[i] ?? 0.4, y: p.auto.y[i] ?? 0.5, tiltX: 0, tiltY: 0, heading: 0, shake: 0, jolt: false },
          t0 + k * slotDur,
        );
      }
      rig.drone.perform({ gate: 0, x: 0.4, y: 0.5, tiltX: 0, tiltY: 0, heading: 0, shake: 0, jolt: false }, t0 + bars * barDur);
    }
    const rendered = await off.startRendering();
    return encodeWav(rendered);
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.saveTimer);
    saveLoop(this.loop);
    this.transport.dispose();
    this.rig.drone.dispose();
    this.rig.bass.dispose();
    this.rig.drums.dispose();
    try {
      this.rig.out.disconnect();
      this.rig.perform.disconnect();
    } catch {
      /* gone */
    }
    this.listeners.clear();
  }
}

export { SCENES, DEFAULT_DRONE, DEFAULT_BASS };
