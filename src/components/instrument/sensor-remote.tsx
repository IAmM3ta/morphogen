import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LivingField, MorphoMark, Wordmark } from "./wordmark";
import { useP2PRoom } from "@/lib/multiplayer/use-p2p-room";
import {
  attachSensors,
  localPointerBrushes,
  requestSensorPermission,
  sensorSample,
} from "@/lib/morphogen/sensors";
import { runtime } from "@/lib/morphogen/runtime";
import type { Brush } from "@/lib/morphogen/presets";

export function SensorRemote({ code }: { code: string }) {
  const padRef = useRef<HTMLDivElement>(null);
  const brushesRef = useRef<Brush[]>([]);
  const [armed, setArmed] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const p2p = useP2PRoom({ room: `mg-${code}`, name: "sensor" });
  const linked = p2p.peers.some((p) => p.connectionState === "connected");

  const arm = useCallback(async () => {
    await requestSensorPermission();
    setArmed(true);
  }, []);

  useEffect(() => {
    if (!armed) return;
    return attachSensors();
  }, [armed]);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad || !armed) return;
    return localPointerBrushes(
      pad,
      () => ({ size: 0.06, strength: 0.7 }),
      (b) => {
        brushesRef.current = b;
      },
    );
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      setTilt({
        x: Math.max(-1, Math.min(1, sensorSample.gamma / 45)),
        y: Math.max(-1, Math.min(1, sensorSample.beta / 45)),
      });
      if (now - last > 50) {
        last = now;
        p2p.broadcast({
          t: "s",
          fx: runtime.flowX,
          fy: runtime.flowY,
          mic: 0,
          br: brushesRef.current.map((b) => ({ x: b.x, y: b.y, s: b.size, k: b.strength })),
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [armed, p2p]);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <MorphoMark className="mb-2 size-8" title="MORPHOS" />
        <LivingField className="text-[10px]" />
        <h1 className="mt-1 flex items-center gap-2 text-3xl">
          <Wordmark variant="hud" className="text-3xl" />
        </h1>
        <p className="mt-1 font-mono text-sm tracking-[0.2em] text-muted">{code}</p>
        <p className="mt-2 text-xs text-muted">
          {linked ? "Linked to the stage" : p2p.joined ? "Waiting for the stage…" : "Joining…"}
        </p>
      </header>

      <div ref={padRef} className="relative mx-4 mb-4 min-h-0 flex-1 touch-none overflow-hidden rounded-xl bg-bg-elevated shadow-[var(--shadow-border)]">
        <div
          className="pointer-events-none absolute size-24 rounded-full bg-accent/25"
          style={{
            left: `calc(50% + ${tilt.x * 40}%)`,
            top: `calc(50% + ${tilt.y * 40}%)`,
            transform: "translate(-50%, -50%)",
            transition: "left 80ms linear, top 80ms linear",
          }}
        />
        {!armed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              This phone becomes tilt, shake, and touch for the MORPHOS stage.
            </p>
            <Button size="lg" onClick={() => void arm()}>
              Arm sensors
            </Button>
          </div>
        )}
        {armed && (
          <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-muted">
            Touch to inoculate · tilt to flow
          </p>
        )}
      </div>
    </div>
  );
}
