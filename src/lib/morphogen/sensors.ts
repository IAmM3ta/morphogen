import { runtime } from "./runtime";
import { MAX_BRUSHES, type Brush } from "./presets";

type DOE = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type DME = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export type SensorSample = {
  alpha: number;
  beta: number;
  gamma: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
};

export const sensorSample: SensorSample = {
  alpha: 0,
  beta: 0,
  gamma: 0,
  ax: 0,
  ay: 0,
  az: 0,
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

export function attachSensors(onShake?: (mag: number) => void): () => void {
  let restG = 0;
  let restB = 0;
  let samples = 0;
  let calibrated = false;

  const onOrient = (e: DeviceOrientationEvent) => {
    const gamma = e.gamma ?? 0;
    const beta = e.beta ?? 0;
    sensorSample.alpha = e.alpha ?? 0;
    sensorSample.beta = beta;
    sensorSample.gamma = gamma;
    if (!calibrated) {
      restG += gamma;
      restB += beta;
      samples += 1;
      if (samples >= 14) {
        restG /= samples;
        restB /= samples;
        calibrated = true;
      }
      runtime.flowX = 0;
      runtime.flowY = 0;
      return;
    }
    let dx = gamma - restG;
    let dy = beta - restB;
    if (Math.abs(dx) < 10) dx = 0;
    if (Math.abs(dy) < 10) dy = 0;
    runtime.flowX = Math.max(-0.35, Math.min(0.35, dx / 110));
    runtime.flowY = Math.max(-0.35, Math.min(0.35, dy / 130));
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (a) {
      sensorSample.ax = a.x ?? 0;
      sensorSample.ay = a.y ?? 0;
      sensorSample.az = a.z ?? 0;
      const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      if (mag > 18) onShake?.((mag - 18) / 14);
    }
    const r = e.rotationRate;
    if (r) {
      sensorSample.gx = r.alpha ?? 0;
      sensorSample.gy = r.beta ?? 0;
      sensorSample.gz = r.gamma ?? 0;
    }
  };

  window.addEventListener("deviceorientation", onOrient);
  window.addEventListener("devicemotion", onMotion);
  return () => {
    window.removeEventListener("deviceorientation", onOrient);
    window.removeEventListener("devicemotion", onMotion);
    runtime.flowX = 0;
    runtime.flowY = 0;
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
};

export function localPointerBrushes(
  canvas: HTMLElement,
  getSize: () => { size: number; strength: number },
  onChange?: (brushes: Brush[]) => void,
  onLock?: (x: number, y: number) => void,
  onCharge?: (charge: number, x: number, y: number) => void,
): () => void {
  const fingers = new Map<number, Finger>();
  const DOUBLE_MS = 420;
  const HOLD_MS = 260;
  const TAP_MOVE = 22;
  const DOUBLE_DIST = 64;
  let lastTap = { t: 0, x: 0, y: 0 };
  let pointerHeard = false;

  const sync = () => {
    const list: Brush[] = [];
    for (const f of fingers.values()) {
      if (!f.painting) continue;
      const { size, strength } = getSize();
      list.push({
        x: f.x,
        y: f.y,
        px: f.px,
        py: f.py,
        size,
        strength,
      });
      if (list.length >= MAX_BRUSHES) break;
    }
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
  };

  const cancelPendingLocks = () => {
    for (const f of fingers.values()) {
      if (f.lock && !f.locked && !f.painting) startPaint(f);
    }
  };

  const begin = (id: number, clientX: number, clientY: number) => {
    const { x, y, px, py } = fromClient(clientX, clientY);
    const now = performance.now();
    const isDouble =
      fingers.size === 0 &&
      now - lastTap.t < DOUBLE_MS &&
      Math.hypot(px - lastTap.x, py - lastTap.y) < DOUBLE_DIST;

    if (fingers.size > 0) cancelPendingLocks();

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
    };
    fingers.set(id, f);

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
    }
  };

  const move = (id: number, clientX: number, clientY: number) => {
    const f = fingers.get(id);
    if (!f) return;
    const { x, y, px, py } = fromClient(clientX, clientY);
    f.px = f.x;
    f.py = f.y;
    f.x = x;
    f.y = y;
    const dx = f.x - f.px;
    const dy = f.y - f.py;
    runtime.pointerMotion = Math.min(1.4, runtime.pointerMotion + Math.hypot(dx, dy) * 6);

    const moved = Math.hypot(px - f.sx, py - f.sy);
    if (f.lock && !f.locked && !f.painting && moved > TAP_MOVE) startPaint(f);
    else if (f.painting) sync();
  };

  const end = (id: number, clientX: number, clientY: number) => {
    const f = fingers.get(id);
    if (!f) return;
    if (f.hold != null) window.clearTimeout(f.hold);
    if (!f.painting && !f.locked) {
      const elapsed = performance.now() - f.t;
      const { px, py } = fromClient(clientX, clientY);
      const moved = Math.hypot(px - f.sx, py - f.sy);
      if (elapsed < 280 && moved < TAP_MOVE) lastTap = { t: performance.now(), x: px, y: py };
    }
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
      /* capture is optional; fullscreen wrap still receives moves */
    }
    begin(e.pointerId, e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!fingers.has(e.pointerId)) return;
    e.preventDefault();
    const extras =
      typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    if (extras && extras.length > 1) {
      for (const c of extras) move(e.pointerId, c.clientX, c.clientY);
    } else {
      move(e.pointerId, e.clientX, e.clientY);
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

  const onTouchStart = (e: TouchEvent) => {
    if (isUi(e.target)) return;
    e.preventDefault();
    if (pointerHeard) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches.item(i);
      if (!t) continue;
      begin(t.identifier + 1000, t.clientX, t.clientY);
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (pointerHeard) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches.item(i);
      if (!t) continue;
      move(t.identifier + 1000, t.clientX, t.clientY);
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
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
    for (const f of fingers.values()) {
      if (f.hold != null) window.clearTimeout(f.hold);
    }
    fingers.clear();
    sync();
  };
}
