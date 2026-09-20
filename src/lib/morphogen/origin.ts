import { runtime } from "./runtime";
import { glassToWorld } from "./space";

/** Provenance of a still or loop. This is the SKU — the field is the edition. */
export type Origin = {
  v: 1;
  instrument: "MORPHOS";
  kind: "still" | "loop";
  capturedAt: string;
  chemistry: {
    presetId: string;
    feed: number;
    kill: number;
    du: number;
    dv: number;
    speed: number;
    steps: number;
    paletteId: string;
    seedNonce: number;
  };
  voice: {
    keyId: string;
    modeId: string;
    waveform: string;
    pitchMinHz: number;
    pitchMaxHz: number;
    vibratoRate: number;
    vibratoDepth: number;
  };
  pose: {
    roll: number;
    pitch: number;
    yaw: number;
    spin: number;
    gforce: number;
    heading: number;
    compass: boolean;
  };
  space: { x: number; y: number; z: number };
  field: {
    energy: number;
    meanU: number;
    meanV: number;
    edge: number;
  };
  durationSec?: number;
};

export function snapshotOrigin(kind: Origin["kind"], presetId: string, durationSec?: number): Origin {
  const p = runtime.params;
  const s = runtime.sense;
  const world = glassToWorld(runtime.antenna.x, runtime.antenna.y);
  const origin: Origin = {
    v: 1,
    instrument: "MORPHOS",
    kind,
    capturedAt: new Date().toISOString(),
    chemistry: {
      presetId,
      feed: p.feed,
      kill: p.kill,
      du: p.du,
      dv: p.dv,
      speed: p.speed,
      steps: p.steps,
      paletteId: p.paletteId,
      seedNonce: runtime.seedNonce,
    },
    voice: {
      keyId: runtime.keyId,
      modeId: runtime.modeId,
      waveform: runtime.waveform,
      pitchMinHz: runtime.pitchMinHz,
      pitchMaxHz: runtime.pitchMaxHz,
      vibratoRate: runtime.vibratoRate,
      vibratoDepth: runtime.vibratoDepth,
    },
    pose: {
      roll: round4(s.roll),
      pitch: round4(s.pitch),
      yaw: round4(s.yaw),
      spin: round4(s.spin),
      gforce: round4(s.gforce),
      heading: round4(s.heading),
      compass: s.compass,
    },
    space: { x: round4(world.x), y: round4(world.y), z: round4(world.z) },
    field: {
      energy: round4(runtime.stats.energy),
      meanU: round4(runtime.stats.meanU),
      meanV: round4(runtime.stats.meanV),
      edge: round4(runtime.stats.edge),
    },
  };
  if (typeof durationSec === "number") origin.durationSec = round4(durationSec);
  return origin;
}

function round4(n: number) {
  return Math.round(n * 1e4) / 1e4;
}

export function originStamp(iso = new Date().toISOString()) {
  return iso.replace(/[:.]/g, "-").slice(0, 19);
}
