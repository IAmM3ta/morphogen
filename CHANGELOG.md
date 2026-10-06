# Changelog

All notable changes to MORPHOS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Where it stands, ahead of v0.1.0. The public name is **MORPHOS**, subtitle
**Living Field**, at [morphos.grok.me](https://morphos.grok.me). The
repository stays `IAmM3ta/morphogen`.

The glass opens clear. A finger is a pitch. The way you hold the phone
tunes the chemistry. The field stays dark.

### v2: sharp reaction–diffusion (branch `morphos-v2`, draft)

#### Added

- **WebGPU field.** Gray–Scott as a WGSL compute shader is now the primary renderer. It uses a 9-point Laplacian, anisotropic diffusion, a style map so feed and kill vary across the grid, flow advection, and symmetric onset seeding. The render pass is crisp: derivative anti-aliased thresholds, emboss and specular light, a palette LUT, and an optional kaleidoscope. The grid follows device pixels, up to 2048 on a desktop, at 6–40 steps a frame. The WebGL2 field remains the fallback, including when the device is lost mid-session.
- **Audio drives the chemistry.** Bass raises feed, centroid shifts kill and the palette, highs open the diffusion ratio, onsets plant symmetric growth, and drone pitch sets the fold order. Tilt and compass steer anisotropy and flow.
- **Regime morph.** The field holds a regime, then glides between spots, mitosis, stripes, labyrinth, coral, worms, holes, and waves.
- **Looks:** Marble, Temple Gold, Chrome Bloom, Teal Beam, UV Mandala, Projection, and Cymatic, as RD colourings with lighting and symmetry. **Field** keeps the species palette.
- **Video-informed looks:** Iridescent, Oscillators, Hex Cymatic, and Fluidica. A WGSL lighting pass gives them Schlick thin-film iridescence, a GGX warm key and cool fill, wrap diffuse with cavity AO, faux SSS, and HDR emissive. A three-level bloom chain (½, ¼, ⅛) carries per-look weights and thresholds.
- **Ripple layer:** a low-res 2D wave equation. Strong onsets kick the centre and touches kick where they land. Its gradient refracts the field and nudges feed and kill. Fluidica's diamond lattice shatters on a bass drop and re-forms after about 30 s.
- **Adaptive quality.** The steps per frame drop first, then the sim grid. Output resolution never drops. The renderer keeps GPU work to at most two frames in flight.
- **Sound engine v2:** a Drone synth, a refined 16-step bass with finger record, drums, a transport, loop scenes A–D, a drone lane, Export WAV, and a limiter.
- **v2 dock:** Field, Drone, Bass, and Loop modes, plus the Look panel. The top bar gains Full (with iOS Add-to-Home-Screen guidance), Glass, and Keys. New keys: M, V/Shift+V, P, G, ?, Esc.
- **Wallpaper mode:** the `/wallpaper` route or `?wallpaper=1`, with `visual`, `quality`, `fps`, `dpr`, and `audio` options. No UI, sensors, prompts, or MIDI.
- **PWA manifest:** `display_override` (fullscreen, standalone), 192 and 512 icons, and a Wallpaper shortcut.
- **Design doc:** `docs/v2/morphos-v2-design.tex` and its PDF.

#### Changed

- A touch alone never plants growth. Drag plants, and onsets seed away from your fingers.
- Adaptive quality sheds bloom passes and ripple resolution before the deeper step and grid cuts. Skipped (GPU-busy) frames now carry their time forward, so motion keeps pace.

#### Fixed

- Marble: iso lines no longer speckle the empty ground.

### Added

- **Snapshot.** `backup/54d449a-2026-10-05/` is a full archive of commit
  `54d449a` (MEMETiC glass on MORPHOS), kept so that build can be restored.
- **Clear glass.** The menu is hidden until you ask for it. Along the top:
  View, Reset, Rec, Loop, and Play. View opens the full controls. Hide
  puts them away.
- **Pose.** Heading sets the scale of the pattern (north broader, south
  finer). Tilt changes how it grows. A small movement stirs it. Motion
  permission is requested on Enter.
- **Chord.** One finger glides with height. A second finger adds a fifth.
  A third adds the octave. The three move together. Under them is The Hum,
  the Schumann cavity at 7.83 Hz, heard in the chant band (125–501 Hz).
- **Listen.** Room mic, a dropped track, or a shared tab. A hit seeds the
  field under the fingers. Bass, mids, and highs move the chemistry.
  Spotify’s stream stays inside Spotify.
- **Still.** A high-resolution PNG of the field, with an `origin.json`
  of the chemistry, voice, and pose.
- **Editions.** A press zip (flat, book-match, or kaleidoscope) for
  Resolume, TouchDesigner, or print. A glyph plate is a maze-like code of
  that origin. Phone Camera opens the instrument on those settings.
  Find sticker tracks the print and lays the living field on the paper.
- **TouchDesigner 087.** Sync packets are v2, with a `feedback` block
  mapped onto Blur, Sharpen, Level, Transform, and Feedback reset.
  MIDI CCs 30–35 carry the bands. Pixels stay on NDI. The socket is knobs.
- **Outer billiards,** optional. The mode is a regular n-gon. The centre
  of the glass holds. Outer rings walk the scale. Orbit defaults to 0,
  so a finger holds its pitch until you turn the walk on.
- **Releases.** Visual and audio credits stamp the glyph. Tracks stack
  into a sleeve, one plate per song.

### Changed

- **Detail.** Fine cyan threads on navy, at two scales. Facing changes how
  small they are. A tilt changes the kind of pattern. The ground stays dark.
- **Dark field.** Pattern bodies are deep teal and blue. The ground stays
  near black. White is no longer the fill.
- **Separate forms.** Turning the phone changes the scale. It does not
  smear every shape along one shared direction.
- Factory chemistry is **Living** in Abyss: a field that keeps moving.
  The old mitosis and coral rests migrate to it.
- Vibrato is not tied to the gyro. Default depth is off. Rate and depth
  live on the Sound face.
- Share card, X banner, favicon, and the Enter mark use the Morpho
  lockup: two blue wings, a hairline outline, on the field.
- The glass is a table in front of the listener (HRTF). Left and right
  are azimuth. The top of the glass is farther and higher. Locked drones
  and loops sit where they were played.
- Sound sheet is translucent, and it closes. Hide removes the card. The
  eye brings it back.

### Fixed

- **Glass defects (M-12/M-02/M-06/M-18/M-19/M-21).** The opening screen reads
  *Tap to start sound. Drag to plant growth. Touch the field to hear it.*
  The tap-and-hold freeze gesture is gone; Freeze is a labeled button
  (*Freeze: stop growth. Release: let it grow again.*). After Enter, chips
  show audio unlocked|failed and motion on|denied. Touch plays; only a drag
  plants growth. MIDI is requested from Sync, never on Enter. The window
  pointermove listener is non-passive. Icon-only controls carry labels.
- The control card could not be dismissed. It stayed in the middle of
  the field. Hide now removes it.
- Colour views only recoloured the picture, and a morph could freeze
  the palette. They now retune the live colour and The Hum.
- The default voice read as a buzzer, and extra fingers collapsed onto
  the first. It is a sine again, and each contact is its own voice.
- Opening the app could go silent, or freeze on the first touch
  (`NaN` Hz from a float used as a scale index). Resume is gesture-only.
  Pitch is interpolated. The solver keeps running if a voice errors.

## [0.1.0] — 2026-09-17

First public cut. A Gray–Scott audiovisual instrument: VisualPDE-class field,
The Hum, polyphonic theremin voices, phone IMU, loop lock, optional
TouchDesigner / MIDI for projection. Playable in any modern browser.

### Added

- WebGL2 Gray–Scott solver with a 9-point isotropic Laplacian, aspect-correct
  sim FBO, and adaptive 4K-class resolution.
- VisualPDE-shaped **Field** console:
  - Typeset Pearson Gray–Scott
    (`∂u/∂t = Dᵤ ∇²u − uv² + F(1−u)`, `∂v/∂t = Dᵥ ∇²v + uv² − (F+k)v`).
    Touch a coefficient to bind its slider.
  - Named parameters in `name = value in [min, max]` form: **F**, **k**,
    **Dᵤ**, **Dᵥ**.
  - **Brush** — disk inoculum of species *v*, radius **R** and value **B**.
  - **Time** — steps/frame **N** and timestep **Δt**.
  - **Views** — colour map of *v* and hillshade lighting **L**.
- Species packs (mitosis, solitons, pulsing, holes, mazes, fingerprint,
  spirals, worms, coral, skate) that morph F / k / Dᵤ / Dᵥ / palette in
  place — the field is not reset.
- **The Hum** — always-on Schumann-resonance sine pad (7.83 Hz and audible
  octaves). Default waveform is sine.
- Polyphonic theremin: one live voice per finger (height is pitch, pan from
  *x*, pressure opens harmonics). Pointer hover is an audio-only antenna.
- Waveforms: sine, triangle, saw, square, pulse, and spectrum (the living
  field as harmonic partials).
- Phone chassis as the other antenna: tilt, roll, spin, and g-force sculpt
  The Hum and live pitch. Motion permission is requested on Enter.
- Loop lock (double-tap and hold, or `L`) — freeze the current generation
  as sound + overlay memory. Four layers. `Z` releases, `Shift+Z` clears.
- Undo (`U` / `⌘Z`) over field, chemistry, waveform, and lock count.
- Reset (`R`), restore defaults (`Shift+R`), session record (`C`).
- Image modes: inoculate, develop, resist, palette-from-photograph.
  Optional camera.
- TouchDesigner WebSocket client (JSON at 20 Hz) and MIDI CC 20–29.
  Callbacks in `public/td/morphogen_ws_callbacks.py`.
- PWA identity **Morphogen** (site title wins over the host slug).

### Changed

- Solver runs many Euler steps **every animation frame** (default 20) so
  the pattern lives, instead of a gated ~30 Hz petri dish.
- Default chemistry is Pearson mitosis (`F = 0.037`, `k = 0.06`,
  `Dᵤ = 0.21`, `Dᵥ = 0.105`) with the scientific **Field** colormap and
  hillshade from ∇*v*.
- Click / touch seeds a modest disk of *v* = 1, *u* = ½ (Pearson IC).
  Fingers do not paint marks, ripples, or halos on the glass.
- Gyro uses **absolute pose** for audio (holding the phone *is* the
  instrument) and rest-relative flow for the field, so tilt does not
  streak the colonies.
- Species, feed, kill, and diffusion sliders never reseed the field.

### Fixed

- Vertical LED-like streaks from a square FBO, gyro wind, and hot
  inoculum feeding locked layers back into the solver.
- Colonies dying after lift-off (cool seeds at 4K); inoculum is now a
  VisualPDE-style disk of *v* = 1.
- Preview / PWA title picking up a grok.me host slug
  (“Cap Granite Lagoon Rocket”) instead of Morphogen.
- Gyro appearing silent: rest-relative pose zeroed a stable hold, and
  mappings were inaudible. Absolute pose and stronger Hum / FM mapping.
- Adaptive quality collapsing after the CPU seed hitch; first 90 frames
  are ignored for downsample.
- Enter hanging on MIDI init and PeriodicWave construction; audio unlock
  is wrapped, `started` is set first.

### Keyboard

| Key | Action |
| --- | --- |
| `1`–`9` | Morph to a species pack |
| `L` | Lock loop |
| `Z` | Release last loop |
| `Shift+Z` | Clear all loops |
| `U` / `⌘Z` | Undo |
| `R` | Reset field |
| `Shift+R` | Restore defaults |
| `C` | Record / stop |
| `H` | Hide chrome |
| `F` | Fullscreen |

[Unreleased]: https://github.com/IAmM3ta/morphogen/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/IAmM3ta/morphogen/releases/tag/v0.1.0
