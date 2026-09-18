export type LoopClip = {
  id: string;
  name: string;
  duration: number;
  looping: boolean;
  playing: boolean;
  createdAt: number;
};

export const MAX_LOOPS = 6;

export function pickAudioRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}
