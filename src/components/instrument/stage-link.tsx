import { useEffect } from "react";
import { useP2PRoom } from "@/lib/multiplayer/use-p2p-room";
import type { Brush } from "@/lib/morphogen/presets";

type RemoteFrame = {
  t: "s";
  fx: number;
  fy: number;
  mic: number;
  br: { x: number; y: number; s: number; k: number }[];
  shake?: number;
};

export function StageLink({
  code,
  onBrushes,
  onFlow,
  onShake,
  onPeerCount,
}: {
  code: string;
  onBrushes: (from: string, brushes: Brush[]) => void;
  onFlow: (x: number, y: number) => void;
  onShake: (mag: number) => void;
  onPeerCount: (n: number) => void;
}) {
  const p2p = useP2PRoom({ room: `mg-${code}`, name: "stage" });

  useEffect(() => {
    return p2p.onMessage((from, data) => {
      const msg = data as RemoteFrame;
      if (!msg || msg.t !== "s") return;
      onBrushes(
        from,
        (msg.br ?? []).map((b) => ({ x: b.x, y: b.y, px: b.x, py: b.y, size: b.s, strength: b.k })),
      );
      onFlow(msg.fx ?? 0, msg.fy ?? 0);
      if (msg.shake && msg.shake > 0) onShake(msg.shake);
    });
  }, [p2p, onBrushes, onFlow, onShake]);

  useEffect(() => {
    const n = p2p.peers.filter((p) => p.connectionState === "connected").length;
    onPeerCount(n);
  }, [p2p.peers, onPeerCount]);

  return null;
}
