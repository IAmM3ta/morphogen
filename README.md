# MORPHOS

**Living Field.** A theremin made of chemistry. You play a Gray–Scott field with your fingers and with the way you hold the phone. The glass opens dark and clear. The first finger is a pitch. The phone tunes the pattern.

Public instrument: **[morphos.grok.me](https://morphos.grok.me)** · repository stays [`IAmM3ta/morphogen`](https://github.com/IAmM3ta/morphogen).

**[Changelog](CHANGELOG.md)** · **[Instrument guide (PDF)](docs/Morphos-Instrument-Guide.pdf)** · **[Releases](https://github.com/IAmM3ta/morphogen/releases)** · tagged **[v0.1.0](https://github.com/IAmM3ta/morphogen/releases/tag/v0.1.0)** · `main` is ahead of that tag.

## Download

Compiled packages for the tagged cut live on the [v0.1.0 release](https://github.com/IAmM3ta/morphogen/releases/tag/v0.1.0):

| File | What it is |
| --- | --- |
| `morphogen-0.1.0-vercel.zip` | Production build (Vercel Build Output API — static assets + Node 22 server) |
| `morphogen-0.1.0-src.zip` | Source tree at the tag |
| `SHA256SUMS` | Checksums |

What has changed since that tag is in the [changelog](CHANGELOG.md). Deploy the compiled package with [Vercel](https://vercel.com):

```bash
unzip morphogen-0.1.0-vercel.zip -d .vercel/output
npx vercel deploy --prebuilt
```

Or from source: `npm install && npm run build && npm run preview`.

## Play

1. Open the app and tap **Enter**. Grant motion. Nothing sounds until you touch the glass.
2. The menu stays away. **View** opens it. **Reset** returns the factory field. **Rec** records the session. **Loop** records a layer. **Play** starts or pauses those loops.
3. **One finger.** Slide up and the pitch rises. Slide down and it falls. The voice is a warm sine in D Dorian, about 125–501 Hz. Lo still opens to 7.83 Hz, the Schumann fundamental.
4. **Two fingers, then three.** The second is a fifth above the first. The third is the octave. They glide together.
5. **The phone is the other hand.** The direction you face changes the scale of the pattern. A tilt changes how it grows. A small movement stirs it. Turning does not smear the picture.
6. The field is dark. Bodies of the pattern are deep colour. The ground stays near black.
7. **Freeze** holds the last pitch as a drone, seated where you froze it. **Release** peels one layer. `L` freezes, `Z` releases, `Shift+Z` clears.
8. **Headphones.** The glass is a table in front of you. Left and right are direction. The top of the glass is farther away.
9. **Listen**, on the Sound face, hears a room, a file, or a shared tab. It does not read Spotify’s stream. Silence leaves the chemistry alone.
10. `U` or `⌘Z` undoes. `R` reseeds the field. `Shift+R` or **Reset** restores factory settings and clears loops. `C` records. `H` hides the chrome.

## Field

**View** opens the card. **Sound** is waveform, key, mode, the Hz window, and vibrato (off until you ask). **More** opens Field, Image, Body, and Sync. The Field pane follows [VisualPDE Parameters](https://visualpde.com/user-guide/advanced-options#parameters).

| Symbol | Meaning |
| --- | --- |
| **F**, **k** | feed and kill. The phone nudges these while you hold it. |
| **Dᵤ**, **Dᵥ** | diffusion. Heading scales them. |
| **R**, **B** | disk brush radius and value |
| **N**, **Δt** | steps per frame and timestep |
| **L** | hillshade |

Species packs set the chemistry without reseeding. Factory rest is **Living**.

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
- Headphones for spatial audio
- Microphone and camera are optional

## TouchDesigner

In MORPHOS, open **Sync** and connect to a WebSocket DAT running as a server. Callbacks live in `public/td/morphogen_ws_callbacks.py`. Packets are v2 and line up with TouchDesigner Tutorial 087. MIDI CCs 20–35 are the other path.

## Stack

TanStack Start, React 19, WebGL2 Gray–Scott, Web Audio (polyphonic theremin, HRTF, The Hum).
