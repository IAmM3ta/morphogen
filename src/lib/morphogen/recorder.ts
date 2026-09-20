export function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm",
    "video/mp4",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export class SessionRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  recording = false;
  startedAt = 0;
  lastElapsed = 0;
  mime = "";
  onStop: ((blob: Blob, name: string) => void) | null = null;
  onError: ((msg: string) => void) | null = null;

  get elapsed() {
    if (this.recording) return (performance.now() - this.startedAt) / 1000;
    return this.lastElapsed;
  }

  start(canvas: HTMLCanvasElement, audio: MediaStream | null): boolean {
    if (this.recording) return false;
    if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
      this.onError?.("Recording is not available in this browser.");
      return false;
    }
    const video = canvas.captureStream(30);
    const tracks = [...video.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])];
    const mixed = new MediaStream(tracks);
    this.mime = pickRecorderMime();
    this.chunks = [];
    try {
      this.rec = this.mime
        ? new MediaRecorder(mixed, { mimeType: this.mime, videoBitsPerSecond: 6_000_000 })
        : new MediaRecorder(mixed);
    } catch {
      this.onError?.("Could not start a recording.");
      return false;
    }
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.onerror = () => {
      this.recording = false;
      this.onError?.("Recording failed.");
    };
    this.rec.onstop = () => {
      this.lastElapsed = (performance.now() - this.startedAt) / 1000;
      this.recording = false;
      const type = this.mime || "video/webm";
      const blob = new Blob(this.chunks, { type });
      this.chunks = [];
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      this.onStop?.(blob, `morphogen-${stamp}.${ext}`);
      video.getTracks().forEach((t) => t.stop());
    };
    this.rec.start(250);
    this.recording = true;
    this.startedAt = performance.now();
    return true;
  }

  stop() {
    if (!this.rec || this.rec.state === "inactive") {
      this.recording = false;
      return;
    }
    try {
      this.rec.stop();
    } catch {
      this.recording = false;
    }
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
