/**
 * Spatial map for MORPHOS.
 *
 * Two frames share the same Web Audio listener (right-handed, metres):
 *   +X right, +Y up, −Z in front.
 *
 * Instrument space (fingers, locked chords, glass loops)
 *   The glass is a table. Bottom of the screen is near the chest;
 *   top is farther and higher. Pitch already uses this axis
 *   (`yToScaleHz`: y=0 top = high). Distance rolloff makes high
 *   notes recede; low notes sit in the lap.
 *
 * World space (GPS / cell loops, next sprint)
 *   Local tangent plane: east = +X, north = −Z, altitude = +Y,
 *   then yawed by compass heading so "ahead" is the way the
 *   phone faces.
 */

export type Vec3 = { x: number; y: number; z: number };

export const ROOM = {
  /** Left–right span of the glass, metres. */
  width: 2.2,
  /** How high a top-of-glass note sits. */
  height: 1.15,
  /** How far the far edge is in front of the listener. */
  depth: 2.4,
  /** Distance to the bottom edge (near). */
  near: 0.42,
} as const;

export const EARTH_M = 6_378_137;

export function glassToWorld(nx: number, ny: number): Vec3 {
  const x = (clamp01(nx) - 0.5) * ROOM.width;
  const y = (1 - clamp01(ny)) * ROOM.height + 0.08;
  const z = -(ROOM.near + (1 - clamp01(ny)) * (ROOM.depth - ROOM.near));
  return { x, y, z };
}

/** East/north/up metres from an origin, then yaw so heading 0° = north = −Z. */
export function geoToWorld(
  lat: number,
  lng: number,
  alt: number,
  originLat: number,
  originLng: number,
  originAlt: number,
  headingDeg: number,
): Vec3 {
  const dLat = ((lat - originLat) * Math.PI) / 180;
  const dLng = ((lng - originLng) * Math.PI) / 180;
  const north = dLat * EARTH_M;
  const east = dLng * EARTH_M * Math.cos((originLat * Math.PI) / 180);
  const up = alt - originAlt;
  const h = (headingDeg * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  return {
    x: east * cos - north * sin,
    y: up,
    z: -(north * cos + east * sin),
  };
}

export function configurePanner(panner: PannerNode) {
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 0.55;
  panner.maxDistance = 12;
  panner.rolloffFactor = 0.9;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
}

export function placePanner(panner: PannerNode, pos: Vec3, now: number, tau = 0.045) {
  if (panner.positionX) {
    try {
      panner.positionX.setTargetAtTime(pos.x, now, tau);
      panner.positionY.setTargetAtTime(pos.y, now, tau);
      panner.positionZ.setTargetAtTime(pos.z, now, tau);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    panner.setPosition(pos.x, pos.y, pos.z);
  } catch {
    /* no spatial */
  }
}

/**
 * Instrument-space listener: stands at the origin, looks at −Z.
 * Phone roll/pitch lean the head so the gyro is still an antenna.
 * Compass is reserved for world-space loops (do not yaw the glass).
 */
export function poseInstrumentListener(
  ctx: AudioContext,
  roll: number,
  pitch: number,
  now: number,
) {
  const listener = ctx.listener;
  const yaw = roll * 0.45;
  const tilt = pitch * 0.28;
  const fx = Math.sin(yaw);
  const fy = Math.sin(tilt);
  const fz = -Math.cos(yaw);
  const ux = Math.sin(yaw) * Math.sin(tilt) * 0.15;
  const uy = Math.cos(tilt);
  const uz = 0;
  setListener(listener, { x: 0, y: 0.12, z: 0 }, { x: fx, y: fy, z: fz }, { x: ux, y: uy, z: uz }, now);
}

export function poseWorldListener(
  ctx: AudioContext,
  headingDeg: number,
  now: number,
) {
  const listener = ctx.listener;
  const h = (headingDeg * Math.PI) / 180;
  setListener(
    listener,
    { x: 0, y: 1.6, z: 0 },
    { x: Math.sin(h), y: 0, z: -Math.cos(h) },
    { x: 0, y: 1, z: 0 },
    now,
  );
}

function setListener(
  listener: AudioListener,
  pos: Vec3,
  forward: Vec3,
  up: Vec3,
  now: number,
) {
  if (listener.positionX) {
    try {
      listener.positionX.setTargetAtTime(pos.x, now, 0.08);
      listener.positionY.setTargetAtTime(pos.y, now, 0.08);
      listener.positionZ.setTargetAtTime(pos.z, now, 0.08);
      listener.forwardX.setTargetAtTime(forward.x, now, 0.08);
      listener.forwardY.setTargetAtTime(forward.y, now, 0.08);
      listener.forwardZ.setTargetAtTime(forward.z, now, 0.08);
      listener.upX.setTargetAtTime(up.x, now, 0.08);
      listener.upY.setTargetAtTime(up.y, now, 0.08);
      listener.upZ.setTargetAtTime(up.z, now, 0.08);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    listener.setPosition(pos.x, pos.y, pos.z);
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  } catch {
    /* no spatial */
  }
}

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}
