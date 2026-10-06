import { Sheet } from "./bits";

const KEYS: [string, string][] = [
  ["Space", "Freeze / Release the field"],
  ["M", "Next play mode (Field · Drone · Bass · Loop)"],
  ["V", "Next look"],
  ["P", "Loop play / stop"],
  ["G", "Clear glass (hide everything)"],
  ["H", "Show / hide controls"],
  ["F", "Fullscreen"],
  ["R / Shift R", "Reset field / default settings"],
  ["L", "Hold a drone layer"],
  ["Z / Shift Z", "Release a layer / all layers"],
  ["U or ⌘Z", "Undo"],
  ["C", "Record session"],
  ["1–9", "Species"],
  ["Wheel · Shift+wheel · arrows", "Tilt and compass on a desktop"],
  ["?", "This sheet"],
  ["Esc", "Close panels"],
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div data-ui className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-bg/40 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <Sheet title="Keys" onClose={onClose}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {KEYS.map(([k, d]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-fg">{k}</dt>
                <dd className="text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </Sheet>
      </div>
    </div>
  );
}
