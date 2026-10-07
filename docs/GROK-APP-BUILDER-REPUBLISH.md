# Grok App Builder — republish Morphos to morphos.grok.me

**Why this exists:** `morphos.grok.me` is hosted by **Grok’s app builder**, not by GitHub Actions or Vercel auto-deploy. Merging to `main` does **not** update the live site. Metta (or whoever owns the builder project) must republish from the builder after each ship cut.

**Repo of record:** [IAmM3ta/morphogen](https://github.com/IAmM3ta/morphogen) · branch `main`

---

## Preconditions (before you open the builder)

1. Confirm `main` tip includes the cut you want:
   ```bash
   gh api repos/IAmM3ta/morphogen/commits/main --jq '{sha:.sha,msg:.commit.message}'
   ```
2. For the **opaque dock (M-24)** cut, `main` must contain chrome label **`Stage · Sync`** (commit lineage includes `6b37d6c` or later).
3. Build locally once so you know the tree is green:
   ```bash
   git clone https://github.com/IAmM3ta/morphogen.git && cd morphogen
   git checkout main && git pull
   npm install && npx tsc --noEmit && npm run build
   ```
4. Do **not** publish `morphos-v2` until SAUL clears M-24/M-06 on live glass and Metta green-lights the draft PR.

---

## Step-by-step — republish from Grok app builder

Exact UI labels in the Grok builder can move; follow the intent of each step.

1. Open the Grok app that owns **morphos.grok.me** (same project that last published Morphos).
2. Sync or import source from GitHub **`IAmM3ta/morphogen`**, branch **`main`**, at the SHA you verified above.  
   - If the builder has a “Sync from GitHub / Update from repo” control, use that.  
   - If it only accepts pasted files or a zip: `git archive --format=zip HEAD -o morphogen-main.zip` from a clean `main` checkout and upload.
3. Confirm the builder’s working tree shows:
   - Splash: `Tap to start sound. Drag to plant growth. Touch the field to hear it.`
   - Dock faces: **Play · Plant · Freeze · Stage · Sync** (fourth face must include the word Sync)
   - Zero `Double-tap` strings in app source
4. Run the builder’s **Build / Preview**. Smoke-check:
   - Enter → audio/motion chips update; no MIDI prompt
   - Dock panels are opaque (not washed over the cyan field)
   - Stage · Sync opens Sync / MIDI path only from that door
5. **Publish / Deploy** to the existing morphos.grok.me host (do not create a second public URL unless Metta asks).
6. Hard-refresh live: `https://morphos.grok.me/` (bypass cache).
7. Ping **SAUL** in MORPHOGEN APP with the live SHA or publish time so glass-verify can run the four M-24 criteria + residual M-06.

---

## Live verify checklist (for SAUL / G-Combinator after publish)

| Check | Pass |
| --- | --- |
| Splash one-liner exact | HIT |
| `Double-tap` in served JS | zero |
| Dock panels opaque / readable | HIT |
| Play · Plant · Freeze · **Stage · Sync** on chrome | HIT |
| Hum · Hands · Field chips only | HIT |
| Enter ≠ MIDI; Sync owns MIDI | HIT |
| No Schumann / Bentov on chrome | HIT |

Bundle scan (optional):

```bash
curl -sL https://morphos.grok.me -o /tmp/m.html
# fetch linked /assets/*.js then:
rg -a -c 'Double-tap|Stage · Sync|Tap to start sound|Freeze stops growth|Schumann' /tmp/m*.js /tmp/m.html
```

---

## What GitHub cannot do

- Push bytes to `morphos.grok.me`
- Trigger the Grok builder publish API (no connector)
- Clear SAUL gates — only live verify clears M-24/M-06

## Related docs

- [README](../README.md) — play, run, ship status
- [MUI Bentov spike](./mui-bentov-spike.md) — post-clear WebGPU + GLSL peer plan
- [Instrument guide HTML](./morphogen-guide.html) — Guide credit (Bentov) lives here only
