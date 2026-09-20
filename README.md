# MORPHOS

**Living Field.** A theremin made of chemistry. 4K-class Gray–Scott reaction-diffusion you play with fingers, the phone’s IMU, and a mouse in any modern browser. First touch voices an overtone chant in the current key; lift and it recedes. Optional sync to projectors via TouchDesigner or MIDI.

Public instrument: **[morphos.grok.me](https://morphos.grok.me)**

**[Changelog](CHANGELOG.md)** · **[Instrument guide (PDF)](docs/Morphogen-Instrument-Guide.pdf)** · **[Releases](https://github.com/IAmM3ta/morphogen/releases)** · current **[v0.1.0](https://github.com/IAmM3ta/morphogen/releases/tag/v0.1.0)**

## Download

Compiled packages live on the [v0.1.0 release](https://github.com/IAmM3ta/morphogen/releases/tag/v0.1.0):

| File | What it is |
| --- | --- |
| `morphogen-0.1.0-vercel.zip` | Production build (Vercel Build Output API — static assets + Node 22 server) |
| `morphogen-0.1.0-src.zip` | Source tree at the tag |
| `SHA256SUMS` | Checksums |

Deploy the compiled package with [Vercel](https://vercel.com):

```bash
unzip morphogen-0.1.0-vercel.zip -d .vercel/output
npx vercel deploy --prebuilt
```

Or from source: `npm install && npm run build && npm run preview`.

## Play

1. Open the app and tap **Enter**.
2. **Silent until a finger.** Default waveform is a warm sine in D Dorian (~125–501 Hz). Two fingers, two voices. Lift and it recedes. Lo still opens to 7.83 Hz.
3. **Height is pitch, across is amplitude.** Voices snap to the current key and mode. Left/right is no longer pan — roll the chassis to pan. Each finger is a voice. Fingers leave no marks.
4. **The chassis is the other antenna.** Tilt, roll, spin, and g-force sculpt The Hum. The compass can walk the key around the circle of fifths. Permission is requested on Enter.
5. On a laptop, move the pointer for pitch — no click required. Click or drag to seed the chemistry (a disk of *v*). The field is a live Gray–Scott vis: species morph in place.
6. **Freeze** holds the last pitch as a drone you play over. **Release** peels one layer. `L` freezes, `Z` releases, `Shift+Z` clears.
7. Species buttons **morph chemistry in place** — they do not reseed. `1`–`9` pick a species.
8. **Sound** (on the card, or Console → Sound) chooses sine (warm voice), triangle, saw, square, pulse, or spectrum; key (including C♯); mode (Dorian at rest, plus Ionian, Aeolian, minor pentatonic, …); and the Hz window (factory 125–501 Hz — the chant band; Lo opens to 7.83 Hz).
9. `U` or `⌘Z` **undoes** the last change (paint, species, waveform, reset). `R` resets the field, `Shift+R` or the **Default** toggle restores factory settings (mitosis, warm sine, D Dorian, 125–501 Hz, and clears loops). `C` records the session.
10. Every finger is a voice. On a phone, two (or more) contacts play at once.

## Field console

Open **Sound** on the card for waveform, key, mode, and range. **More** opens the full console. On a phone the card sits under the wordmark so preview chrome cannot cover it. The Field pane follows [VisualPDE Parameters](https://visualpde.com/user-guide/advanced-options#parameters): a typeset Pearson Gray–Scott equation, then named sliders `name = value in [min, max]`.

| Symbol | Meaning |
| --- | --- |
| **F**, **k** | feed and kill |
| **Dᵤ**, **Dᵥ** | diffusion of *u* and *v* |
| **R**, **B** | disk brush radius and value (species *v*) |
| **N**, **Δt** | steps per frame and timestep |
| **L** | hillshade lighting |

Touch a coefficient in the equation to bind its slider. Species packs set (F, k, Dᵤ, Dᵥ) without reseeding.

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

In MORPHOS, open **Sync** and connect to a WebSocket DAT running as a server. Callbacks live in `public/td/morphogen_ws_callbacks.py`. MIDI CCs 20–29 are an alternative.

## Stack

TanStack Start, React 19, WebGL2 Gray–Scott, Web Audio (polyphonic theremin + field pad).
