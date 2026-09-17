# Morphogen

A living **reaction-diffusion** audiovisual instrument. Play it with fingers, photographs, a phone’s sensors, and a microphone. Optional sync to projectors via TouchDesigner or MIDI.

This is a **normal-browser app**. Open it in Chrome, Safari, Firefox, or Edge — desktop or phone. WebGL2 is required. TouchDesigner, MIDI, camera, and motion are optional.

## Play

1. Tap **Enter the field**.
2. Rest fingers on the field — each one plants a colony of cells that divide on their own. Several at once.
3. Double-tap and hold to **lock a loop** (a memory of this sound and pattern). Paint after that to grow the next generation from it. Stack four. `L` locks, `Z` releases, `Shift+Z` clears.
4. Tilt is off until you turn it on in **Body**. Open the console for species, palettes, camera, and TouchDesigner.

Mouse on a laptop is the same instrument: click-drag plants colonies. `1`–`9` pick species, `R` reseeds, `H` hides chrome, `F` fullscreen.

## Run in a browser (local)

```bash
git clone https://github.com/IAmM3ta/morphogen.git
cd morphogen
npm install
npm run dev
```

Then open the URL Vite prints. Production:

```bash
npm run build
npm run preview
```

### Requirements

- Node 22+
- A browser with WebGL2
- Microphone / motion / camera are optional and requested only when you turn them on

## TouchDesigner

In Morphogen, open **Sync** and connect to a WebSocket DAT running as a server (default `ws://127.0.0.1:9980`). Callbacks live in `public/td/morphogen_ws_callbacks.py`. MIDI CCs 20–29 are an alternative. Hide chrome (`H`) and fullscreen (`F`) to capture the field as the projector picture.

## Stack

TanStack Start, React 19, WebGL2 Gray–Scott, Web Audio.
