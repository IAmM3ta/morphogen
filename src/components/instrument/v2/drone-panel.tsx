import { useV2 } from "@/lib/morphos-v2/store-v2";
import { DRONE_VOICES } from "@/lib/morphos-v2/drone";
import type { SoundV2Snapshot } from "@/lib/morphos-v2/sound-v2";
import type { SoundV2 } from "@/lib/morphos-v2/sound-v2";
import { Chip, Sheet, V2Slider } from "./bits";

export function DronePanel({
  sound,
  snap,
  motion,
  onEnableMotion,
  onClose,
}: {
  sound: SoundV2;
  snap: SoundV2Snapshot;
  motion: "on" | "denied" | "off";
  onEnableMotion: () => void;
  onClose: () => void;
}) {
  const drone = useV2((s) => s.drone);
  const setDrone = useV2((s) => s.setDrone);
  const set = (p: Partial<typeof drone>) => {
    setDrone(p);
    sound.setDrone(p);
  };
  return (
    <Sheet title="Drone" onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        {DRONE_VOICES.map((v) => (
          <Chip key={v.id} active={drone.voice === v.id} onClick={() => set({ voice: v.id })} label={v.blurb}>
            {v.name}
          </Chip>
        ))}
        <Chip active={snap.hold} onClick={() => sound.setHold(!snap.hold)} label="Keep the drone sounding without a finger">
          Hold
        </Chip>
        <Chip
          active={drone.quantize > 0.5}
          onClick={() => set({ quantize: drone.quantize > 0.5 ? 0 : 1 })}
          label="Snap pitch to the key and mode, or play freely"
        >
          {drone.quantize > 0.5 ? "In key" : "Free"}
        </Chip>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <V2Slider label="Glide" value={drone.glide} onChange={(n) => set({ glide: n })} />
        <V2Slider label="Space" value={drone.space} onChange={(n) => set({ space: n })} />
        <V2Slider label={snap.shimmer ? "Shimmer" : "Shimmer (unavailable)"} value={drone.shimmer} onChange={(n) => set({ shimmer: n })} />
        <V2Slider label="Sub" value={drone.sub} onChange={(n) => set({ sub: n })} />
        <V2Slider label="Level" value={drone.level} onChange={(n) => set({ level: n })} />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Slide up for pitch, sideways for brightness.{" "}
        {motion === "on"
          ? "Tilt opens the filter; turning walks the upper voice."
          : motion === "denied"
            ? "Motion is off for this site — wheel and arrow keys stand in for tilt."
            : "Wheel and arrow keys stand in for tilt."}
      </p>
      {motion !== "on" && (
        <div className="mt-2">
          <Chip onClick={onEnableMotion} label="Ask for motion and orientation access">
            Enable motion
          </Chip>
        </div>
      )}
    </Sheet>
  );
}
