# Morphogen

A **theremin made of chemistry**. 4K-class Gray–Scott reaction-diffusion you play with fingers, the phone’s IMU, and a mouse in any modern browser. The rest state is **The Hum** — Schumann resonances as a sine pad. Optional sync to projectors via TouchDesigner or MIDI.

## Play

1. Open the app and tap **Enter**.
2. **The Hum is always on.** Default waveform is sine, tuned to Earth cavity modes (~7.83 Hz and its audible octaves).
3. **Height is pitch.** Move up the glass for higher notes, snapped toward Schumann multiples. Left/right is stereo. Each finger is a voice. Fingers leave no marks — colonies bloom only in the chemistry.
4. **The chassis is the other antenna.** Lean for brightness, roll for chorus, spin for vibrato. Press (or a fatter contact) for more harmonic.
5. On a laptop, just move the pointer — no click required. Click or rest fingers to plant colonies in the field.
6. Double-tap and hold to **lock a loop**. `L` locks, `Z` releases, `Shift+Z` clears.
7. Species buttons **morph chemistry in place** — they do not reseed. `1`–`9` pick a species.
8. **Sound → Waveform** chooses sine (The Hum), triangle, saw, square, pulse, or spectrum (the field as harmonic partials).
9. `U` or `⌘Z` **undoes** the last change (paint, species, waveform, reset). `R` resets the field, `Shift+R` restores defaults, `C` records the session.

## Run locally

```bash
git clone https://github.com/IAmM3ta/morphogen.git
cd morphogen
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

### Requirements

- Node 22+
- A browser with **WebGL2**
- iPhone / iPad: Safari or Chrome, with motion permission on first enter
- Microphone and camera are optional

## TouchDesigner

In Morphogen, open **Sync** and connect to a WebSocket DAT running as a server. Callbacks live in `public/td/morphogen_ws_callbacks.py`. MIDI CCs 20–29 are an alternative.

## Stack

TanStack Start, React 19, WebGL2 Gray–Scott, Web Audio (polyphonic theremin + field pad).
