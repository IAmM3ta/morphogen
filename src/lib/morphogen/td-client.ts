import { runtime } from "./runtime";
import { sensorSample } from "./sensors";

export type TdStatus = "idle" | "connecting" | "connected" | "error";

/** IIHQ Tutorial 087 — Feedback TOP loop knobs. */
export type TdFeedback = {
  blur: number;
  sharpen: number;
  opacity: number;
  gamma: number;
  contrast: number;
  scale: number;
  rotate: number;
  tx: number;
  ty: number;
  reset: number;
};

export type TdPacket = {
  v: 2;
  t: number;
  instrument: "MORPHOS";
  params: {
    feed: number;
    kill: number;
    du: number;
    dv: number;
    speed: number;
    glow: number;
  };
  sensors: {
    alpha: number;
    beta: number;
    gamma: number;
    ax: number;
    ay: number;
    az: number;
    heading: number;
    roll: number;
    pitch: number;
  };
  audio: {
    rms: number;
    bass: number;
    mid: number;
    high: number;
    centroid: number;
    energy: number;
    listen: number;
  };
  field: {
    meanU: number;
    meanV: number;
    energy: number;
    cx: number;
    cy: number;
    edge: number;
  };
  voice: {
    key: string;
    mode: string;
    voices: number;
    orbitN: number;
    orbitPeriod: number;
  };
  feedback: TdFeedback;
  loop: {
    count: number;
  };
  touches: { x: number; y: number; p: number }[];
  grid?: number[];
};

export function buildFeedback(reset = 0): TdFeedback {
  const p = runtime.params;
  const s = runtime.stats;
  const b = runtime.bands;
  const L = runtime.listen;
  const sense = runtime.sense;
  return {
    blur: clamp(p.du * 48 + b.high * L * 8, 1, 32),
    sharpen: clamp(0.35 + s.edge * 2.4, 0, 4),
    opacity: clamp(0.55 + (0.06 - p.kill) * 6, 0.35, 0.95),
    gamma: clamp(0.45 + p.feed * 8, 0.35, 1.2),
    contrast: clamp(0.9 + s.energy * 0.45, 0.7, 1.6),
    scale: 1 + (s.energy - 0.5) * 0.006 + b.rms * L * 0.004,
    rotate: sense.compass ? sense.heading * 0.05 : sense.roll * 8,
    tx: runtime.flowX * 0.45 + (b.high - b.bass) * L * 0.08,
    ty: runtime.flowY * 0.45,
    reset,
  };
}

export function buildPacket(includeGrid: boolean, micRms: number, reset = 0): TdPacket {
  const p = runtime.params;
  const s = runtime.stats;
  const b = runtime.bands;
  const packet: TdPacket = {
    v: 2,
    t: Date.now(),
    instrument: "MORPHOS",
    params: { feed: p.feed, kill: p.kill, du: p.du, dv: p.dv, speed: p.speed, glow: p.glow },
    sensors: {
      alpha: sensorSample.alpha,
      beta: sensorSample.beta,
      gamma: sensorSample.gamma,
      ax: sensorSample.ax,
      ay: sensorSample.ay,
      az: sensorSample.az,
      heading: runtime.sense.heading,
      roll: runtime.sense.roll,
      pitch: runtime.sense.pitch,
    },
    audio: {
      rms: b.rms || micRms,
      bass: b.bass,
      mid: b.mid,
      high: b.high,
      centroid: b.centroid,
      energy: s.energy,
      listen: runtime.listen,
    },
    field: {
      meanU: round4(s.meanU),
      meanV: round4(s.meanV),
      energy: round4(s.energy),
      cx: round4(s.cx),
      cy: round4(s.cy),
      edge: round4(s.edge),
    },
    voice: {
      key: runtime.keyId,
      mode: runtime.modeId,
      voices: runtime.brushes.length,
      orbitN: runtime.orbitN,
      orbitPeriod: runtime.orbitPeriod,
    },
    feedback: buildFeedback(reset),
    loop: { count: runtime.lockCount },
    touches: runtime.brushes.map((br) => ({ x: round4(br.x), y: round4(br.y), p: round4(br.strength) })),
  };
  if (includeGrid) {
    packet.grid = Array.from(s.grid, (n) => round4(n));
  }
  return packet;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

export class TdClient {
  status: TdStatus = "idle";
  lastError = "";
  private ws: WebSocket | null = null;
  private url = "";
  private timer: number | null = null;
  private includeGrid = true;
  private getMic: () => number = () => 0;
  private lastSeed = -1;
  onStatus: ((s: TdStatus, err?: string) => void) | null = null;

  connect(url: string, includeGrid: boolean, getMic: () => number) {
    this.disconnect();
    this.url = url.trim();
    this.includeGrid = includeGrid;
    this.getMic = getMic;
    this.lastSeed = runtime.seedNonce;
    if (!this.url) {
      this.setStatus("error", "Enter a WebSocket URL");
      return;
    }
    this.setStatus("connecting");
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.setStatus("error", err instanceof Error ? err.message : "Invalid URL");
      return;
    }
    this.ws.onopen = () => {
      this.setStatus("connected");
      this.ws?.send(
        JSON.stringify({ v: 2, hello: "MORPHOS", recipe: "iihq-087", t: Date.now() }),
      );
      this.timer = window.setInterval(() => this.pump(), 50);
    };
    this.ws.onclose = () => {
      this.clearTimer();
      if (this.status !== "idle") this.setStatus("idle");
    };
    this.ws.onerror = () => {
      this.setStatus("error", "Socket error — if this page is HTTPS, TouchDesigner must serve wss://");
    };
  }

  disconnect() {
    this.clearTimer();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus("idle");
  }

  private pump() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const reset = runtime.seedNonce !== this.lastSeed ? 1 : 0;
    this.lastSeed = runtime.seedNonce;
    try {
      this.ws.send(JSON.stringify(buildPacket(this.includeGrid, this.getMic(), reset)));
    } catch {
      /* ignore send failures */
    }
  }

  private clearTimer() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private setStatus(s: TdStatus, err = "") {
    this.status = s;
    this.lastError = err;
    this.onStatus?.(s, err);
  }
}
