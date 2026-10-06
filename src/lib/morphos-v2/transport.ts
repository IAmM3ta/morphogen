/**
 * Look-ahead transport (Chris Wilson's "A Tale of Two Clocks" pattern):
 * a coarse timer wakes every ~25 ms and schedules every 16th-note step that
 * falls inside the next `ahead` seconds at exact AudioContext times.
 *
 * The timer runs in a tiny Worker when possible, because main-thread timers
 * are throttled hard in background tabs.
 */
export type StepEvent = { step: number; bar: number; time: number; dur: number };

const WORKER_SRC = `let id=0;onmessage=(e)=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage('t'),25);}else if(e.data==='stop'){clearInterval(id);}};`;

export class Transport {
  bpm = 120;
  swing = 0;
  stepsPerBar = 16;
  playing = false;
  private ahead = 0.14;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private startedAt = 0;
  private worker: Worker | null = null;
  private interval = 0;
  /** (step, time) scheduling callback. */
  onStep: ((e: StepEvent) => void) | null = null;
  /** Lightweight per-tick callback (automation playback). */
  onTick: ((now: number) => void) | null = null;
  private history: StepEvent[] = [];

  constructor(private ctx: BaseAudioContext) {
    const mobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    this.ahead = mobile ? 0.2 : 0.14;
  }

  get stepDur() {
    return 60 / Math.max(30, Math.min(220, this.bpm)) / 4;
  }

  get barDur() {
    return this.stepDur * this.stepsPerBar;
  }

  /** Change tempo without jumping the loop phase. */
  setBpm(bpm: number) {
    const next = Math.max(40, Math.min(200, Math.round(bpm)));
    if (this.playing) {
      const now = this.ctx.currentTime;
      const pos = Math.max(0, now - this.startedAt) / this.barDur;
      this.bpm = next;
      this.startedAt = now - pos * this.barDur;
    } else {
      this.bpm = next;
    }
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.bar = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.startedAt = this.nextTime;
    this.history = [];
    this.startTimer();
    this.tick();
  }

  stop() {
    this.playing = false;
    this.stopTimer();
  }

  private startTimer() {
    this.stopTimer();
    try {
      if (typeof Worker !== "undefined") {
        const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "application/javascript" }));
        this.worker = new Worker(url);
        URL.revokeObjectURL(url);
        this.worker.onmessage = () => this.tick();
        this.worker.postMessage("start");
        return;
      }
    } catch {
      this.worker = null;
    }
    this.interval = window.setInterval(() => this.tick(), 25);
  }

  private stopTimer() {
    if (this.worker) {
      try {
        this.worker.postMessage("stop");
        this.worker.terminate();
      } catch {
        /* ignore */
      }
      this.worker = null;
    }
    if (this.interval) window.clearInterval(this.interval);
    this.interval = 0;
  }

  private tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    // If we fell far behind (tab was suspended), jump forward instead of bursting.
    if (this.nextTime < now - 0.25) {
      const lost = Math.ceil((now - this.nextTime) / this.stepDur);
      for (let i = 0; i < lost; i++) this.advance();
      this.nextTime = now + 0.02;
    }
    while (this.nextTime < now + this.ahead) {
      const dur = this.stepDur;
      const swingOffset = this.step % 2 === 1 ? this.swing * dur * 0.5 : 0;
      const e: StepEvent = { step: this.step, bar: this.bar, time: this.nextTime + swingOffset, dur };
      this.history.push(e);
      if (this.history.length > 64) this.history.shift();
      try {
        this.onStep?.(e);
      } catch {
        /* keep time */
      }
      this.nextTime += dur;
      this.advance();
    }
    try {
      this.onTick?.(now);
    } catch {
      /* ignore */
    }
  }

  private advance() {
    this.step += 1;
    if (this.step >= this.stepsPerBar) {
      this.step = 0;
      this.bar += 1;
    }
  }

  /** Where the playhead is *now* (what you hear), for UI and visuals. */
  position(now = this.ctx.currentTime): { step: number; bar: number; phase: number; beatPhase: number; barPhase: number } {
    if (!this.playing) return { step: -1, bar: 0, phase: 0, beatPhase: 0, barPhase: 0 };
    let cur: StepEvent | null = null;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const e = this.history[i]!;
      if (e.time <= now) {
        cur = e;
        break;
      }
    }
    const elapsed = Math.max(0, now - this.startedAt);
    const beat = elapsed / (this.stepDur * 4);
    const barPhase = (elapsed / this.barDur) % 1;
    if (!cur) return { step: -1, bar: 0, phase: 0, beatPhase: beat % 1, barPhase };
    return {
      step: cur.step,
      bar: cur.bar,
      phase: Math.min(1, (now - cur.time) / cur.dur),
      beatPhase: beat % 1,
      barPhase,
    };
  }

  /** Absolute loop position (in bars, fractional) for automation lanes. */
  loopPosition(now: number, bars: number): number {
    if (!this.playing) return 0;
    const elapsed = Math.max(0, now - this.startedAt);
    const b = elapsed / this.barDur;
    return b % Math.max(1, bars);
  }

  dispose() {
    this.stop();
    this.onStep = null;
    this.onTick = null;
  }
}
