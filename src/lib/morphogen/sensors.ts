import { runtime } from "./runtime";
import { MAX_BRUSHES, type Brush } from "./presets";

type DOE = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type DME = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type OrientEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

export type SensorSample = {
  alpha: number;
  beta: number;
  gamma: number;
  heading: number;
  ax: number;
  ay: number;
  az: number;
  ux: number;
  uy: number;
  uz: number;
  gx: number;
  gy: number;
  gz: number;
};

export const sensorSample: SensorSample = {
  alpha: 0,
  beta: 0,
  gamma: 0,
  heading: 0,
  ax: 0,
  ay: 0,
  az: 0,
  ux: 0,
  uy: 0,
  uz: 0,
  gx: 0,
  gy: 0,
  gz: 0,
};

export async function requestSensorPermission(): Promise<boolean> {
  try {
    const DOE = DeviceOrientationEvent as DOE;
    if (typeof DOE.requestPermission === "function") {
      const res = await DOE.requestPermission();
      if (res !== "granted") return false;
    }
    const DME = DeviceMotionEvent as DME;
    if (typeof DME.requestPermission === "function") {
      const res = await DME.requestPermission();
      if (res !== "granted") return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function attachSensors(): () => void {
  let restG = 0;
  let restB = 0;
  let restA = 0;
  let samples = 0;
  let calibrated = false;
  let spin = 0;
  let lastMag = 9.81;

  const applyOrient = (e: OrientEvent) => {
    const gamma = e.gamma ?? 0;
    const beta = e.beta ?? 0;
    const alpha = e.alpha ?? 0;
    sensorSample.alpha = alpha;
    sensorSample.beta = beta;
    sensorSample.gamma = gamma;
    if (typeof e.webkitCompassHeading === "number") sensorSample.heading = e.webkitCompassHeading;
    else sensorSample.heading = alpha;

    // Absolute pose is the other antenna — how you hold the phone is the sound.
    runtime.sense.roll = Math.max(-1, Math.min(1, gamma / 42));
    runtime.sense.pitch = Math.max(-1, Math.min(1, (beta - 40) / 52));
    runtime.sense.heading = sensorSample.heading;

    if (!calibrated) {
      restG += gamma;
      restB += beta;
      restA += alpha;
      samples += 1;
      if (samples >= 8) {
        restG /= samples;
        restB /= samples;
        restA /= samples;
        calibrated = true;
      }
      runtime.flowX = 0;
      runtime.flowY = 0;
      runtime.sense.yaw = 0;
      return;
    }
    let dx = gamma - restG;
    let dy = beta - restB;
    let dz = alpha - restA;
    if (dz > 180) dz -= 360;
    if (dz < -180) dz += 360;
    if (Math.abs(dx) < 3) dx = 0;
    if (Math.abs(dy) < 3) dy = 0;
    runtime.sense.yaw = Math.max(-1, Math.min(1, dz / 80));
    runtime.flowX = Math.max(-0.22, Math.min(0.22, (dx / 45) * 0.18));
    runtime.flowY = Math.max(-0.22, Math.min(0.22, (dy / 50) * 0.18));
  };

  const onOrient = (e: DeviceOrientationEvent) => applyOrient(e as OrientEvent);
  const onOrientAbs = (e: Event) => applyOrient(e as OrientEvent);

  const onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    let mag = lastMag;
    if (g) {
      sensorSample.ax = g.x ?? 0;
      sensorSample.ay = g.y ?? 0;
      sensorSample.az = g.z ?? 0;
      mag = Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0);
      runtime.sense.gforce = Math.max(0, Math.min(1.8, mag / 9.81 - 0.92));
    }
    const a = e.acceleration;
    if (a) {
      sensorSample.ux = a.x ?? 0;
      sensorSample.uy = a.y ?? 0;
      sensorSample.uz = a.z ?? 0;
    }
    const r = e.rotationRate;
    let fromRate = 0;
    if (r) {
      sensorSample.gx = r.alpha ?? 0;
      sensorSample.gy = r.beta ?? 0;
      sensorSample.gz = r.gamma ?? 0;
      fromRate = Math.min(1, Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) / 140);
    }
    const jerk = Math.min(1, Math.abs(mag - lastMag) / 3.2);
    lastMag = mag;
    spin = spin * 0.76 + Math.max(fromRate, jerk) * 0.24;
    runtime.sense.spin = spin;
  };

  window.addEventListener("deviceorientation", onOrient);
  window.addEventListener("deviceorientationabsolute", onOrientAbs);
  window.addEventListener("devicemotion", onMotion);
  return () => {
    window.removeEventListener("deviceorientation", onOrient);
    window.removeEventListener("deviceorientationabsolute", onOrientAbs);
    window.removeEventListener("devicemotion", onMotion);
    runtime.flowX = 0;
    runtime.flowY = 0;
    runtime.sense.roll = 0;
    runtime.sense.pitch = 0;
    runtime.sense.yaw = 0;
    runtime.sense.spin = 0;
  };
}

type Finger = {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
  t: number;
  lock: boolean;
  locked: boolean;
  painting: boolean;
  hold: number | null;
  pressure: number;
  radius: number;
};

export type ContactKind = "down" | "move" | "up";

export type ContactEvent = {
  type: ContactKind;
  id: number;
  x: number;
  y: number;
  pressure: number;
  radius: number;
};

export function localPointerBrushes(
  canvas: HTMLElement,
  getSize: () => { size: number; strength: number },
  onChange?: (brushes: Brush[]) => void,
  onLock?: (x: number, y: number) => void,
  onCharge?: (charge: number, x: number, y: number) => void,
  onContact?: (evt: ContactEvent) => void,
): () => void {
  const fingers = new Map<number, Finger>();
  const DOUBLE_MS = 420;
  const HOLD_MS = 260;
  const TAP_MOVE = 22;
  const DOUBLE_DIST = 64;
  let lastTap = { t: 0, x: 0, y: 0 };
  let pointerHeard = false;

  const feel = (pressure: number, width: number, height: number) => {
    const p = Number.isFinite(pressure) ? pressure : 0;
    const r = Math.max(width, height);
    return {
      pressure: p > 0.02 && p < 0.999 ? p : p >= 0.999 ? 1 : 0.55,
      radius: Math.max(0.15, Math.min(1, r > 1 ? r / 48 : 0.45)),
    };
  };

  const sync = () => {
    const list: Brush[] = [];
    let maxP = 0;
    for (const f of fingers.values()) {
      if (!f.painting) continue;
      const { size, strength } = getSize();
      maxP = Math.max(maxP, f.pressure);
      list.push({
        id: f.id,
        x: f.x,
        y: f.y,
        px: f.px,
        py: f.py,
        size: size * (0.78 + f.radius * 0.5),
        strength: strength * (0.7 + f.pressure * 0.45),
        pressure: f.pressure,
        radius: f.radius,
      });
      if (list.length >= MAX_BRUSHES) break;
    }
    runtime.sense.pressure = maxP;
    if (onChange) onChange(list);
    else runtime.brushes = list;
  };

  const fromClient = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    return {
      x: (clientX - r.left) / w,
      y: (clientY - r.top) / h,
      px: clientX - r.left,
      py: clientY - r.top,
    };
  };

  const emit = (type: ContactKind, f: Finger) => {
    onContact?.({ type, id: f.id, x: f.x, y: f.y, pressure: f.pressure, radius: f.radius });
  };

  const startPaint = (f: Finger) => {
    if (f.painting) return;
    f.painting = true;
    f.lock = false;
    if (f.hold != null) {
      window.clearTimeout(f.hold);
      f.hold = null;
    }
    onCharge?.(0, 0, 0);
    sync();
    emit("down", f);
  };

  const cancelPendingLocks = () => {
    for (const f of fingers.values()) {
      if (f.lock && !f.locked && !f.painting) startPaint(f);
    }
  };

  const begin = (id: number, clientX: number, clientY: number, pressure: number, width: number, height: number) => {
    const { x, y, px, py } = fromClient(clientX, clientY);
    const now = performance.now();
    const isDouble =
      fingers.size === 0 &&
      now - lastTap.t < DOUBLE_MS &&
      Math.hypot(px - lastTap.x, py - lastTap.y) < DOUBLE_DIST;

    if (fingers.size > 0) cancelPendingLocks();

    const fFeel = feel(pressure, width, height);
    const f: Finger = {
      id,
      x,
      y,
      px: x,
      py: y,
      sx: px,
      sy: py,
      t: now,
      lock: isDouble,
      locked: false,
      painting: !isDouble,
      hold: null,
      pressure: fFeel.pressure,
      radius: fFeel.radius,
    };
    fingers.set(id, f);
    runtime.antenna = { x, y, on: false, pressure: 0 };

    if (isDouble) {
      f.hold = window.setTimeout(() => {
        const cur = fingers.get(id);
        if (!cur || cur.painting || cur.locked) return;
        cur.locked = true;
        onLock?.(cur.x, cur.y);
        onCharge?.(0, 0, 0);
        try {
          navigator.vibrate?.(16);
        } catch {
          /* no haptics */
        }
      }, HOLD_MS);
      const started = now;
      const tick = () => {
        const cur = fingers.get(id);
        if (!cur || !cur.lock || cur.locked || cur.painting) return;
        const charge = Math.min(1, (performance.now() - started) / HOLD_MS);
        onCharge?.(charge, cur.x, cur.y);
        if (charge < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      sync();
      emit("down", f);
    }
  };

  const move = (
    id: number,
    clientX: number,
    clientY: number,
    pressure: number,
    width: number,
    height: number,
  ) => {
    const f = fingers.get(id);
    if (!f) return;
    const { x, y, px, py } = fromClient(clientX, clientY);
    f.px = f.x;
    f.py = f.y;
    f.x = x;
    f.y = y;
    const felt = feel(pressure, width, height);
    f.pressure = felt.pressure;
    f.radius = felt.radius;
    const dx = f.x - f.px;
    const dy = f.y - f.py;
    runtime.pointerMotion = Math.min(1.8, runtime.pointerMotion + Math.hypot(dx, dy) * 8);

    const moved = Math.hypot(px - f.sx, py - f.sy);
    if (f.lock && !f.locked && !f.painting && moved > TAP_MOVE) startPaint(f);
    else if (f.painting) {
      sync();
      emit("move", f);
    }
  };

  const end = (id: number, clientX: number, clientY: number) => {
    const f = fingers.get(id);
    if (!f) return;
    if (f.hold != null) window.clearTimeout(f.hold);
    const { x, y, px, py } = fromClient(clientX, clientY);
    f.x = x;
    f.y = y;
    if (!f.painting && !f.locked) {
      const elapsed = performance.now() - f.t;
      const moved = Math.hypot(px - f.sx, py - f.sy);
      if (elapsed < 280 && moved < TAP_MOVE) lastTap = { t: performance.now(), x: px, y: py };
    }
    if (f.painting) emit("up", f);
    fingers.delete(id);
    onCharge?.(0, 0, 0);
    sync();
  };

  const isUi = (target: EventTarget | null) =>
    Boolean((target as HTMLElement | null)?.closest?.("[data-ui]"));

  const down = (e: PointerEvent) => {
    if (isUi(e.target)) return;
    pointerHeard = true;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    begin(e.pointerId, e.clientX, e.clientY, e.pressure, e.width, e.height);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (fingers.has(e.pointerId)) {
      e.preventDefault();
      const extras = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
      if (extras && extras.length > 1) {
        for (const c of extras) move(e.pointerId, c.clientX, c.clientY, c.pressure, c.width, c.height);
      } else {
        move(e.pointerId, e.clientX, e.clientY, e.pressure, e.width, e.height);
      }
      return;
    }
    if (isUi(e.target)) {
      runtime.antenna.on = false;
      return;
    }
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      const { x, y } = fromClient(e.clientX, e.clientY);
      runtime.antenna = {
        x,
        y,
        on: true,
        pressure: e.buttons ? Math.max(0.35, e.pressure) : 0.28,
      };
    }
  };

  const up = (e: PointerEvent) => {
    if (!fingers.has(e.pointerId)) return;
    end(e.pointerId, e.clientX, e.clientY);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      if (!fingers.has(e.pointerId)) runtime.antenna.on = false;
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (isUi(e.target)) return;
    e.preventDefault();
    if (pointerHeard) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches.item(i);
      if (!t) continue;
      begin(t.identifier + 1000, t.clientX, t.clientY, t.force, t.radiusX * 2, t.radiusY * 2);
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (pointerHeard) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches.item(i);
      if (!t) continue;
      move(t.identifier + 1000, t.clientX, t.clientY, t.force, t.radiusX * 2, t.radiusY * 2);
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    if (pointerHeard) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches.item(i);
      if (!t) continue;
      end(t.identifier + 1000, t.clientX, t.clientY);
    }
  };

  const opts: AddEventListenerOptions = { passive: false };
  canvas.addEventListener("pointerdown", down, opts);
  canvas.addEventListener("pointermove", onPointerMove, opts);
  canvas.addEventListener("pointerup", up, opts);
  canvas.addEventListener("pointercancel", up, opts);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("touchstart", onTouchStart, opts);
  canvas.addEventListener("touchmove", onTouchMove, opts);
  canvas.addEventListener("touchend", onTouchEnd, opts);
  canvas.addEventListener("touchcancel", onTouchEnd, opts);
  canvas.style.touchAction = "none";

  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
    for (const f of fingers.values()) {
      if (f.hold != null) window.clearTimeout(f.hold);
    }
    fingers.clear();
    runtime.antenna.on = false;
    sync();
  };
}
