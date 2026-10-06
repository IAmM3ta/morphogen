/**
 * Theremin control surface: touch + phone sensors + desktop fallbacks,
 * conditioned into one smooth control state each frame.
 *
 *   touch Y      → pitch (quantised to key/mode by the voice, glide optional)
 *   touch X      → timbre / brightness
 *   tilt (beta)  → filter cutoff;  roll (gamma) → resonance + stereo
 *   compass      → slow harmonic walk + detune spread
 *   shake / jerk → transient energy (noise bursts, ripples)
 *
 * Desktop: hover = antenna (already provided by the field's pointer layer),
 * wheel = brightness, Shift+wheel = spread, arrow keys nudge tilt.
 */
import { runtime } from "@/lib/morphogen/runtime";
import { sensorSample } from "@/lib/morphogen/sensors";
import { features, pushRipple } from "./features";
import { AngleUnwrap, OneEuro, clamp, clamp01, follow } from "./smoothing";

export type ControlState = {
  /** A hand (touch or hovering mouse) is on the glass. */
  active: boolean;
  /** A finger/mouse is actually pressed. */
  pressed: boolean;
  x: number;
  y: number;
  pressure: number;
  /** Count of fingers. */
  count: number;
  /** −1 … 1, smoothed. */
  tiltX: number;
  tiltY: number;
  /** Unwrapped heading in degrees, smoothed. */
  heading: number;
  /** 0–1 envelope of shaking. */
  shake: number;
  /** One-frame flag: a shake transient just fired. */
  jolt: boolean;
  /** Sensors are reporting. */
  sensing: boolean;
};

export const control: ControlState = {
  active: false,
  pressed: false,
  x: 0.5,
  y: 0.5,
  pressure: 0,
  count: 0,
  tiltX: 0,
  tiltY: 0,
  heading: 0,
  shake: 0,
  jolt: false,
  sensing: false,
};

const fx = new OneEuro(1.6, 0.6);
const fy = new OneEuro(1.6, 0.6);
const fBeta = new OneEuro(0.8, 0.04);
const fGamma = new OneEuro(0.8, 0.04);
const fHead = new OneEuro(0.35, 0.01);
const unwrap = new AngleUnwrap();

let lastAccel = 0;
let lastJoltAt = 0;
let sensedAt = 0;
let virtualTiltX = 0;
let virtualTiltY = 0;
let virtualSpread = 0;
let desktopBound = false;

export function virtualSpreadAmount() {
  return virtualSpread;
}

/** Desktop fallbacks — wheel and arrows. Returns an unbind function. */
export function bindDesktopControls(target: HTMLElement): () => void {
  if (desktopBound) return () => {};
  desktopBound = true;
  const onWheel = (e: WheelEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("[data-ui]")) return;
    const d = clamp(e.deltaY / 600, -0.25, 0.25);
    if (e.shiftKey) virtualSpread = clamp01(virtualSpread - d);
    else virtualTiltY = clamp(virtualTiltY - d, -1, 1);
  };
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "ArrowUp") virtualTiltY = clamp(virtualTiltY + 0.1, -1, 1);
    else if (e.key === "ArrowDown") virtualTiltY = clamp(virtualTiltY - 0.1, -1, 1);
    else if (e.key === "ArrowLeft") virtualTiltX = clamp(virtualTiltX - 0.1, -1, 1);
    else if (e.key === "ArrowRight") virtualTiltX = clamp(virtualTiltX + 0.1, -1, 1);
    else return;
    e.preventDefault();
  };
  target.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("keydown", onKey);
  return () => {
    desktopBound = false;
    target.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKey);
  };
}

/** Call once per frame. `t` in seconds. */
export function updateControl(t: number, dt: number): ControlState {
  const c = control;
  c.jolt = false;
  const hands = runtime.hands;
  const ant = runtime.antenna;
  if (hands.length > 0) {
    let sx = 0;
    let sy = 0;
    let p = 0;
    // Lead finger is the first one down; others widen the voice.
    const lead = hands.slice().sort((a, b) => a.id - b.id)[0]!;
    for (const h of hands) {
      sx += h.x;
      sy += h.y;
      p = Math.max(p, h.pressure);
    }
    const nx = hands.length > 1 ? sx / hands.length : lead.x;
    const ny = hands.length > 1 ? sy / hands.length : lead.y;
    if (!c.active) {
      fx.reset(nx);
      fy.reset(ny);
      pushRipple(nx, ny, 0.5);
    }
    c.x = clamp01(fx.filter(nx, t));
    c.y = clamp01(fy.filter(ny, t));
    c.pressure = p;
    c.count = hands.length;
    c.active = true;
    c.pressed = true;
  } else if (ant.on) {
    if (!c.active) {
      fx.reset(ant.x);
      fy.reset(ant.y);
    }
    c.x = clamp01(fx.filter(ant.x, t));
    c.y = clamp01(fy.filter(ant.y, t));
    c.pressure = ant.pressure;
    c.count = 1;
    c.active = true;
    c.pressed = ant.pressure > 0.3;
  } else {
    c.active = false;
    c.pressed = false;
    c.count = 0;
    c.pressure = follow(c.pressure, 0, dt, 0.01, 0.2);
  }

  // Sensors (populated by the existing attachSensors when motion is on).
  const s = sensorSample;
  const reporting = runtime.gyroOn && (s.beta !== 0 || s.gamma !== 0 || s.alpha !== 0);
  if (reporting) sensedAt = t;
  c.sensing = t - sensedAt < 1.5 && sensedAt > 0;
  if (c.sensing) {
    const beta = fBeta.filter(s.beta, t);
    const gamma = fGamma.filter(s.gamma, t);
    c.tiltY = clamp((beta - 40) / 40, -1, 1);
    c.tiltX = clamp(gamma / 40, -1, 1);
    c.heading = fHead.filter(unwrap.push(s.heading), t);
    // Linear acceleration (gravity removed) → jerk → shake envelope.
    const a = Math.hypot(s.ux, s.uy, s.uz);
    const jerk = Math.abs(a - lastAccel) / Math.max(0.008, dt);
    lastAccel = a;
    const energy = clamp01((a - 1.2) / 10 + (jerk - 40) / 400);
    c.shake = follow(c.shake, energy, dt, 0.02, 0.45);
    if (energy > 0.35 && t - lastJoltAt > 0.18) {
      lastJoltAt = t;
      c.jolt = true;
      pushRipple(c.active ? c.x : 0.5, c.active ? c.y : 0.5, 0.4 + energy * 0.6);
    }
  } else {
    c.tiltX = follow(c.tiltX, virtualTiltX, dt, 0.08, 0.08);
    c.tiltY = follow(c.tiltY, virtualTiltY, dt, 0.08, 0.08);
    c.heading = follow(c.heading, virtualSpread * 360, dt, 0.3, 0.3);
    c.shake = follow(c.shake, 0, dt, 0.02, 0.45);
  }

  const f = features;
  f.touch.x = c.x;
  f.touch.y = c.y;
  f.touch.down = c.active;
  f.touch.count = c.count;
  f.sensors.tiltX = c.tiltX;
  f.sensors.tiltY = c.tiltY;
  f.sensors.heading = c.heading;
  f.sensors.shake = c.shake;
  f.sensors.active = c.sensing;
  return c;
}
