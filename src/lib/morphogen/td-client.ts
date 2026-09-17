import { runtime } from "./runtime";
import { sensorSample } from "./sensors";

export type TdStatus = "idle" | "connecting" | "connected" | "error";

export type TdPacket = {
  v: 1;
  t: number;
  params: {
    feed: number;
    kill: number;
    du: number;
    dv: number;
    speed: number;
  };
  sensors: {
    alpha: number;
    beta: number;
    gamma: number;
    ax: number;
    ay: number;
    az: number;
  };
  audio: {
    rms: number;
    energy: number;
  };
  field: {
    meanU: number;
    meanV: number;
    energy: number;
    cx: number;
    cy: number;
    edge: number;
  };
  loop: {
    count: number;
  };
  touches: { x: number; y: number; p: number }[];
  grid?: number[];
};

export function buildPacket(includeGrid: boolean, micRms: number): TdPacket {
  const p = runtime.params;
  const s = runtime.stats;
  const packet: TdPacket = {
    v: 1,
    t: Date.now(),
    params: { feed: p.feed, kill: p.kill, du: p.du, dv: p.dv, speed: p.speed },
    sensors: {
      alpha: sensorSample.alpha,
      beta: sensorSample.beta,
      gamma: sensorSample.gamma,
      ax: sensorSample.ax,
      ay: sensorSample.ay,
      az: sensorSample.az,
    },
    audio: { rms: micRms, energy: s.energy },
    field: {
      meanU: round4(s.meanU),
      meanV: round4(s.meanV),
      energy: round4(s.energy),
      cx: round4(s.cx),
      cy: round4(s.cy),
      edge: round4(s.edge),
    },
    loop: { count: runtime.lockCount },
    touches: runtime.brushes.map((b) => ({ x: round4(b.x), y: round4(b.y), p: round4(b.strength) })),
  };
  if (includeGrid) {
    packet.grid = Array.from(s.grid, (n) => round4(n));
  }
  return packet;
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
  onStatus: ((s: TdStatus, err?: string) => void) | null = null;

  connect(url: string, includeGrid: boolean, getMic: () => number) {
    this.disconnect();
    this.url = url.trim();
    this.includeGrid = includeGrid;
    this.getMic = getMic;
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
      this.ws?.send(JSON.stringify({ v: 1, hello: "morphogen", t: Date.now() }));
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
    try {
      this.ws.send(JSON.stringify(buildPacket(this.includeGrid, this.getMic())));
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
