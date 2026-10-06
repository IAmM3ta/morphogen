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

1. Open the app and tap **Enter**. Grant motion. *Tap to start sound. Drag to plant growth. Touch the field to hear it.* After Enter, chips read **audio unlocked|failed · motion on|denied**. MIDI is only requested from **Sync**.
2. The menu stays away. **View** opens it. **Reset** returns the factory field. **Rec** records the session. **Loop** records a layer. **Play** starts or pauses those loops.
3. **One finger.** Slide up and the pitch rises. Slide down and it falls. The voice is a warm sine in D Dorian, about 125–501 Hz. Lo still opens to 7.83 Hz, the Schumann fundamental.
4. **Two fingers, then three.** The second is a fifth above the first. The third is the octave. They glide together.
5. **The phone is the other hand.** The direction you face changes the scale of the pattern. A tilt changes how it grows. A small movement stirs it. Turning does not smear the picture.
6. The field is dark. Bodies of the pattern are deep colour. The ground stays near black.
7. **Freeze: stop growth. Release: let it grow again.** Touch plays the pitch under your finger; **drag** plants new growth. `L` freezes, `Z` releases, `Shift+Z` clears.
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

## v2: the sharp field (branch `morphos-v2`)

The reaction–diffusion field is the picture. On browsers with **WebGPU**, MORPHOS runs Gray–Scott as a compute shader. The grid follows device pixels, up to 2048 on the long side on a desktop and 1600 on a phone, and runs 6–40 steps a frame. Edges are cut with derivative anti-aliasing, so they stay crisp. When there is no `navigator.gpu`, no adapter, or the GPU device is lost, the classic WebGL2 field takes over. It plays the same instrument with palette-only looks.

- **Sound drives the chemistry.** Bass raises feed. Brightness (spectral centroid) shifts kill and the palette. Highs open the diffusion ratio. An onset plants symmetric growth. Pitch sets the fold order. Touch alone never plants.
- **The phone steers the flow.** Tilt sets the direction of anisotropic diffusion and the drift of the flow. The compass turns the orientation. On a desktop, the wheel, Shift+wheel, and the arrow keys stand in for them.
- **Regimes morph.** Spots, mitosis, stripes, labyrinth, coral, worms, holes, and waves hold for a while, then glide into each other. **Look → Morph** turns this off.
- **Looks** are colourings of the field: **Field** (the species palette), **Marble**, **Temple Gold**, **Chrome Bloom**, **Teal Beam**, **UV Mandala**, **Projection**, and **Cymatic**. Each one sets a multi-stop colour map, emboss and specular light, thread lines, a style map (where a second regime grows), and an optional kaleidoscope, either a mandala core or the full field.
- **Adaptive quality** lowers the steps per frame first, then the simulation grid. It never lowers the output resolution, so the picture does not go soft. Reduced motion slows the field and calms the look.
- **Play modes** sit in the bottom dock: **Field**, **Drone** (a held drone synth), **Bass** (a 16-step bass line with finger record), **Loop** (drums, a drone lane, scenes A–D, Export WAV). **Look** opens the looks. **Full**, **Glass**, and **Keys** sit in the top bar.

| Key | Does |
| --- | --- |
| `M` | next play mode |
| `V` / `Shift+V` | next / previous look |
| `P` | loop play / stop |
| `G` | clear glass (everything hidden, a faint eye brings it back) |
| `F` | fullscreen |
| `?` | shortcuts sheet |
| `Esc` | close panels |

Renderer overrides: `?gpu=0` or `?renderer=webgl` forces the WebGL2 field. `?gpu=1` retries WebGPU after a failure in this tab.

### Wallpaper mode

Open **`/wallpaper`** (or add `?wallpaper=1` to any URL). There is no gate, no UI, no prompts, no sensors, and no MIDI, and the cursor hides when idle.

| Option | Default | Meaning |
| --- | --- | --- |
| `visual=` | `temple-gold` | `off`, `marble`, `temple-gold`, `chrome-bloom`, `teal-beam`, `uv-mandala`, `projection`, `cymatic` |
| `quality=` | `auto` | `low`, `auto`, `high` |
| `fps=` | `30` | frame cap; `0` means uncapped |
| `dpr=` | `2` | device-pixel-ratio cap (0.5–3) |
| `audio=1` | off | ambient held drone, where the host allows autoplay |

Example: `https://morphos.grok.me/wallpaper?visual=uv-mandala&fps=30&dpr=1.5`

Hosts (from their public docs; not tested on these hosts yet):

- **Windows: [Lively Wallpaper](https://github.com/rocksdanister/lively).** Use **+ (Add wallpaper) → Enter URL** and choose the monitor. Lively renders web wallpapers with WebView2 (Edge) or CefSharp. Autoplay is allowed, and Lively pauses playback when a fullscreen app runs ([Web Player](https://github.com/rocksdanister/lively/wiki/Web-Player), [Performance](https://github.com/rocksdanister/lively/wiki/Performance)).
- **macOS: [Plash](https://sindresorhus.com/plash).** Add the `/wallpaper` URL as a website. Plash mutes audio, can deactivate on battery, and adds an `is-plash-app` class to the page.
- **Android:** third-party apps such as *Lively Wallpapers-With Website* (Google Play) say they set a web page as a live wallpaper. WebGPU support inside those WebViews has not been verified, so expect the WebGL2 field there. Installing the PWA (Add to Home Screen) and opening `/wallpaper` from its shortcut gives a fullscreen, chrome-less field.

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
- A browser with **WebGL2**; **WebGPU** (for example Chrome or Edge 113+ on desktop) for the sharp v2 field
- iPhone / iPad: Safari or Chrome, with motion permission on first enter
- Headphones for spatial audio
- Microphone and camera are optional

## TouchDesigner

In MORPHOS, open **Sync** and connect to a WebSocket DAT running as a server. Callbacks live in `public/td/morphogen_ws_callbacks.py`. Packets are v2 and line up with TouchDesigner Tutorial 087. MIDI CCs 20–35 are the other path.

## Stack

TanStack Start, React 19, WebGPU (WGSL compute) Gray–Scott with a WebGL2 fallback, Web Audio (polyphonic theremin, HRTF, The Hum).
