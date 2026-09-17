import { runtime } from "./runtime";
import { sensorSample } from "./sensors";

function cc(n: number, v: number): [number, number, number] {
  return [0xb0, n, Math.max(0, Math.min(127, Math.round(v * 127)))];
}

export type MidiDevice = { id: string; name: string };

export class MidiOut {
  private access: MIDIAccess | null = null;
  private out: MIDIOutput | null = null;
  private timer: number | null = null;
  devices: MidiDevice[] = [];
  enabled = false;
  onDevices: ((d: MidiDevice[]) => void) | null = null;

  async init(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.refresh();
      this.access.onstatechange = () => this.refresh();
      return true;
    } catch {
      return false;
    }
  }

  private refresh() {
    if (!this.access) return;
    const list: MidiDevice[] = [];
    this.access.outputs.forEach((o) => list.push({ id: o.id, name: o.name ?? o.id }));
    this.devices = list;
    this.onDevices?.(list);
    if (this.out && !this.access.outputs.get(this.out.id)) this.out = null;
  }

  select(id: string | null) {
    if (!this.access) return;
    this.out = id ? (this.access.outputs.get(id) ?? null) : null;
    if (this.out && this.enabled) this.start();
    else this.stop();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on && this.out) this.start();
    else this.stop();
  }

  private start() {
    this.stop();
    this.timer = window.setInterval(() => this.pump(), 40);
  }

  private stop() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private pump() {
    if (!this.out) return;
    const s = runtime.stats;
    const p = runtime.params;
    const msgs: [number, number, number][] = [
      cc(20, (p.feed - 0.01) / 0.08),
      cc(21, (p.kill - 0.04) / 0.04),
      cc(22, s.energy),
      cc(23, s.meanV),
      cc(24, s.cx),
      cc(25, s.cy),
      cc(26, runtime.mic),
      cc(27, (sensorSample.gamma + 90) / 180),
      cc(28, (sensorSample.beta + 90) / 180),
      cc(29, s.edge),
    ];
    const t = performance.now();
    for (const m of msgs) {
      try {
        this.out.send(m, t);
      } catch {
        /* closed */
      }
    }
  }

  dispose() {
    this.stop();
    this.out = null;
  }
}
