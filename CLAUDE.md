# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WebGL2 recreation of the PlayStation 3 XMB background wave ("spline") and sparkle particles. The active implementation in `ps3xmbwave/` is driven by CPU-side pipelines reverse-engineered from the PS3's SPU tasks: `spline.elf` for the wave and `particles.elf` for the particles. `WAVE_REVERSE_ENGINEER.md`, `PARTICLES_REVERSE_ENGINEER.md` and `BACKGROUND_REVERSE_ENGINEER.md` are the sources of truth for that reverse engineering and document what is traced vs. still synthetic. Each is an index over topics split out under `docs/wave/`, `docs/particles/` and `docs/background/`; [Keeping the notes](#keeping-the-notes) says how to read them and add to them. `SPLINE_REVERSE_ENGINEER.md` is upstream's Ghidra reading of `spline.elf`, which `spline-reverse.js` ports: it is not edited, and what the wave pass confirms or overturns in it goes into the wave notes.

## Commands

```bash
npm install          # only needed for the dev server / deploy tooling
npm run start        # serve the whole repo at http://localhost:8000
npm run dev          # same, opens a browser
npm run deploy       # gh-pages, publishes ps3xmbwave/ as the site root
```

Entry points once served: `/ps3xmbwave/` (active), `/dds/` (gradient extraction tool), `/old-research/` (archived guesswork-era implementation).

Each of the three folders also has its own `docker-compose.yml` (nginx, read-only mount) if you want them served independently: `ps3xmbwave` → 9913, `dds` → 9919, `old-research` → 9828.

```bash
node tools/bench/particles.js --seconds 30 --runs 3 --seed 1
node tools/bench/wave.js --seconds 120 --every 2
```

The two benches. `particles.js` runs the particle simulation headless over the spline layer's wave and prints its pool and its drawn particles beside the same measurements read off the console — a savestate's pool and two RSX frame captures. Use it before and after touching the emitter or where the wave sits. `wave.js` measures the spline layer's wave as it is drawn — its band on screen, its depth, how fast it moves — beside the console's own wave, the meshes `spline.elf` wrote in the captures and savestates. Use it before and after touching the wave. Neither needs firmware — the console's column is recorded inside each. `tools/bench/pool-from-savestate.py` regenerates the particle column from a savestate. For the wave, `tools/bench/wave-frames.py` extracts the console's meshes into `re-work/wave-frames/` and `wave.js --console re-work/wave-frames` measures them again.

**There is no build step, no test suite, and no working lint setup.** Both tool scripts glob only the repo root: `npm run lint` (`eslint *.js`) matches no files and there is no eslint config, and `npm run format` (`prettier --write *.js *.html *.md`) only ever rewrites the root Markdown files (`README.md`, `SPLINE_REVERSE_ENGINEER.md`, this file) — it never reaches `ps3xmbwave/` or `dds/`. Don't rely on either as a verification gate. Verification is visual: serve the repo and look at the canvas, plus the browser console for shader compile/link errors (both renderers throw on failure). A caution when checking an edit that way: browsers hold on to the `.js` files hard here, and a forced reload does not always shift them — loading the page from `http://127.0.0.1:8000/` instead of `http://localhost:8000/` is a different origin with an empty cache, which does.

## Architecture

### Module system: browser globals, load-order dependent

`ps3xmbwave/` uses no bundler and no ES modules. Everything communicates through `window`: the data files (`*-settings.js`, `background-gradients-*.js`) are plain top-level `window.X = {...}` assignments, and every other file is an IIFE that exports onto it. `index.html` loads them with plain `<script>` tags in an order that matters:

1. `background-gradients-night.js`, then `background-gradients-day.js` — the day file's trailing IIFE **merges both** month tables into `window.BG_GRADIENT_PRESETS` and `window.BG_GRADIENT_PRESET_OPTIONS` (keys `MM_day` / `MM_night`, plus a `default` legacy entry and an `auto` one), and exports `window.bgGradientForDate`, which `spline.js` calls each frame under `auto`. The XMB walks from one month's texture to the next across the month rather than switching on the 1st, which is what that function reproduces; `docs/background/uniforms.md` has the measurements.
2. `spline-settings.js` — reads `BG_GRADIENT_PRESET_OPTIONS` **at load time** to build the preset dropdown, so it must come after both gradient files.
3. `particles-themes.js`, then `particles-settings.js` — same pattern: the settings file reads `PARTICLE_THEME_OPTIONS` at load time for its theme dropdown.
4. `settings-panels.js`, `spline-reverse.js`, `wave-surface-cpu.js`, `particles-reverse.js`, `xmb-input.js`, then `spline.js` / `particles.js`.

The global contract: `SPLINE_SETTINGS` + `SPLINE_SETTINGS_META`, `BG_GRADIENT_PRESETS` + `BG_GRADIENT_PRESET_OPTIONS` + `bgGradientForDate`, `PARTICLE_SETTINGS` + `PARTICLE_SETTINGS_META`, `PARTICLE_THEMES` + `PARTICLE_THEME_OPTIONS` + `PARTICLE_THEME_KEYS` + `applyParticleTheme` + `xmbSceneDate`, `createSettingsPanel`, `PS3SplineReverse`, `WaveSurfaceCPU`, `PS3ParticlesReverse`, `createXmbInput`, `createSplineLayer`, `createParticlesLayer`. `dds/` is the exception — it uses real ES modules (`<script type="module">`).

### Frame loop and layering

`index.html` owns the canvas, the WebGL2 context, DPR-aware resize, and the `requestAnimationFrame` loop. It advances one clock and calls `splineLayer.render(t, date)` - `date` the moment the scene's clock shows, `xmbSceneDate`, which the backdrop's `auto` gradient follows - then `particlesLayer.render(t, dt)`: the particles are emitted from the wave just drawn, so they share its clock. It hands the spline layer's `surface` (its settings plus the displacement array) and the input adapter to the particle layer. Per frame:

- background gradient fullscreen quad — blending off
- wave mesh (100×100 triangle-strip grid) — `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`
- particles (instanced quads, two passes: lit flakes, then glare sprites) — additive `ONE / ONE`

Depth testing is never enabled, and the wave vertex shader writes `gl_Position` straight from grid coordinates (`vec3(aPos.x, 0, aPos.y)` with displacement applied) — **there is no projection or view matrix**, positions are effectively clip space. Normals for the fresnel term come from `dFdx`/`dFdy` of the interpolated position. The particles, unlike the wave, use the XMB's real camera (eye at (0, 0, 2) looking down −z, 53° vertical field of view), and `particles-reverse.js` places wave points in that world at a fixed depth range.

### The reverse-engineered spline pipeline

`spline-reverse.js` exports `PS3SplineReverse.createPipeline()`. Each frame `spline.js` calls `writeDisplacementTexture(settings, timeSec, ...)`, which runs the traced PS3 chain and fills a `256 × 64` single-channel float (`R32F`) array; `spline.js` uploads it via `texSubImage2D` and the wave vertex shader samples it for height (and again, u-scrolled, for z detail).

Stage order inside the pipeline mirrors the ELF flow documented in `SPLINE_REVERSE_ENGINEER.md`:

`buildRuntimeInputs` (settings → synthetic `b300`, 16 floats) → `buildSplineTable` (synthetic `b380` descriptor bytes → 361 × vec4 table, blended by `b300` then normalized through `NORM_A`/`NORM_B` and `tanh`) → `runKernel` (8 iterations × 8 stored vec4s, matching the `0x400`-stride store layout of `FUN_000045c0`, then temporally smoothed) → per-row B-spline evaluation over 28 control points into the texture.

Constants in this file are not arbitrary: `PS3.TABLE_ENTRY_COUNT` (`0x169`), `STORE_OFFSETS_BYTES`, `OUTPUT_STRIDE_BYTES`, `R37_WORDS`, the `19 * (word >> 4) + (word & 0xF)` index math, and `NORM_A`/`NORM_B` all come from traced addresses. If you change them, reconcile with `SPLINE_REVERSE_ENGINEER.md` rather than tuning them as free parameters, and record the change in the wave notes, not in upstream's file.

`settings.rePipelineBlend` cross-fades each control point between the reverse-engineered core and the older hand-tuned "legacy" wave sum, so `0` reproduces the guesswork look and `1` is pure RE pipeline. The `b300`/`b380` inputs are synthesized from UI settings because real runtime payloads have never been captured — that is the known gap for 1:1 output. `spline.js` stashes the pipeline's intermediates on `window.__PS3_REVERSE_STATE` each frame for console inspection.

### The reverse-engineered particle system

`particles-reverse.js` exports `PS3ParticlesReverse.createSystem()`, and `particles.js` calls its `update(...)` once per frame before drawing. The file has two halves, marked in the code:

- **Verified:** `runTask` is the SPU update task of `particles.elf`, steps 1–8 of `docs/particles/spu-task.md` in order: flow grid sample, noise from three generators reseeded every frame, field rotation, vec4 integration (life in `position.w`, aging rate in `velocity.w`), quaternion spin, death back to the free list, vertex record. Its constants (`FREE = -666`, `LIFE_END`, `NOISE_SEEDS`, `SPIN_FREQS`, `LIFE_MIN`/`LIFE_MAX`, `CAMERA`, `GRID_SCALE`/`GRID_ORIGIN`, `FIELD_CENTRE`) and the 2304-byte block `createParams` lays out were read out of the firmware, RPCS3 savestates and frame captures (`tools/re/readblock.py`). The PPU side of `custom_render_plugin` is ported as far as it is traced: `buildParams` (the block, the wind and the noise's spring), `decayGrid`/`iconWind` (the flow grid), `pickVertices`/`sweep`/`emitAt` drawing from `createQglRandom` (the emitter), `readSensor`/`dpad`/`detectShake` (the controller), `applySpe` (`PARTICLES_SPE.mnu`, under `videoOutput` and `whatsNewBoard`) and `colorFade` (`_Color`); the icons' layout (`ICON_*`, `ITEM_*`) is measured in the captures. None of them are free parameters; reconcile with the notes before changing them.
- **Modelled:** where the console's wave mesh falls on the spline layer's wave and how fast it moves (`meshPoint`, `WAVE_SPEED_GAIN`), and two things the XMB does outside the scene's code: how the icons move between their places (`moveIcons`) and how often a held direction repeats (`REPEAT_FRAMES`). Its constants (`WAVE_DEPTH_NEAR`/`FAR`, `EMIT_EXTENT`, `WAVE_SPEED_GAIN`) are calibrated against the RSX captures and the savestate's pool, and `docs/particles/implementation.md` records how.

`particles-reverse.js` is the largest file in the repo, about 50 KB: find the function a task needs and read that range rather than the whole file.

The simulation steps at a fixed 60 Hz, because the task's semantics are per frame (life advances by the aging rate once per step). It runs at most 4 steps per frame, pre-warms 300 steps on the first frame so the scene starts full, and skips frames while the canvas is empty. Input gathered between steps is held until a step consumes it. `window.__PS3_PARTICLES_STATE` holds its counters for console inspection.

`wave-surface-cpu.js` is a CPU copy of the wave vertex shader in `spline.js`, so particles are emitted on the wave that is drawn. **Any change to that shader's math must be mirrored there.**

`particles.js` draws the system in the two passes the XMB uses, `particles_quads` then `particles_second`, re-authored in GLSL from the decompiled programs, with the parameters the system ran on (`system.effective`: the settings with `PARTICLES_SPE.mnu` applied) and the `_Color` its fade has reached (`system.colorFade`). They are rewritten, not copied — firmware shaders never go in the repo. The iridescent texture is generated at start-up from a 16-colour table fitted to the firmware one.

`xmb-input.js` stands in for the controller, so the web page has something to react to; what it hands over is the console's own input:

- the pointer crossing a virtual 7 × 7 icon grid, and the arrow keys, send D-pad steps in the XMB's four directions, and a key the browser repeats is reported as held — the simulation repeats it every 8 of its frames, as the captures imply;
- dragging with the mouse moves a virtual Sixaxis, reported as the four sensors the PPU reads (the accelerometer's x, y and z, and the gyro) in its own units.

The system polls it once per frame and hands the steps to the simulation one per step, as the XMB sends them.

The simulation files run under Node for headless checks with `globalThis.window = globalThis` and an indirect `eval` of each file in load order. Don't use a `vm` context: global lookups there make it about 30× slower. `tools/bench/particles.js` is that harness: it compares the pool against the console's, slot for slot in the task's own record layout, which is why `createSystem` takes an optional `seed` and the system exposes `pool`, `stride` and `free`. `tools/bench/wave.js` loads the same files to measure the wave.

### Settings and UI

`settings-panels.js` generates panels by **introspecting the settings objects**: every finite numeric key becomes a slider, keys whose meta says `type: 'select'` become a dropdown, keys missing from the meta map fall back to an inferred ±2× range, and a meta's `help` becomes the label's tooltip. It snapshots the settings object at creation time to implement per-row Reset, marks the rows whose value was changed from the panel (in amber, with their Reset enabled, a count in the header and, for the settings its `lockable` option lists, a padlock that locks the value; the returned `locked` Set holds them) and the ones something else set off their defaults (in its colour: lilac for the theme, teal for a sequence, pink for the music), and mutates the live object in place — renderers read `settings.*` fresh on every frame, so no re-initialization or event wiring is needed.

Consequences when adding a knob:

- A new numeric key in `SPLINE_SETTINGS` / `PARTICLE_SETTINGS` gets a slider automatically; add a matching `*_SETTINGS_META` entry or the range will be nonsense.
- Give that entry a `help`, which the panel shows as the label's tooltip: what the knob does, then, after a `\n`, where it comes from — the `.mnu` file and parameter name for a firmware one (`PARTICLES.mnu: emit vel min`), or where it acts for the others.
- Wiring it to a shader needs three edits in the renderer: the `uniform` declaration in the GLSL string, the location lookup (the `waveU` map in `spline.js`, the `UNIFORMS` list in `particles.js`), and the `gl.uniform*` call (`render` in `spline.js`, `setUniforms` in `particles.js`).
- Pipeline-only knobs (the `re*` family, `band*`, `travel*`) need no shader change — they are read inside `spline-reverse.js`.

`PARTICLE_SETTINGS` keys are the `.mnu` parameter names in camelCase (`PARTICLES.mnu`, then `PARTICLES_UI.mnu`), with the firmware values as defaults — keep that mapping so the settings can be checked against the firmware. Knobs of the modelled side and the mouse adapter go in the last group, with `videoOutput`, `whatsNewBoard`, `musicPlayback`, `themeBrightness`, `themeColor` and `xmbBackground`, the console's state the particles are drawn under.

`particles-themes.js` holds the firmware's per-theme parameter sets as differences from those defaults, and `applyParticleTheme(settings, theme)` writes one of them (or, on `'auto'`, the day's blend of two) into the live settings. It also plays the boot sequence `sequence` names on top of the theme - the XMB's start, a game's launch or another content's, with the timings read out of the scene's `.rco` - and writes `sequence` back as one hands over to the next or ends; the particle system rebuilds its pool, empty, when the XMB's start begins. The music (`musicPlayback`) takes the theme's place while it holds the scene's clock, coming in and going out as the scene's code times it, and Theme Settings' Colour (`themeColor`) stops that clock, at the moment `xmbSceneDate` returns, which `index.html` hands the backdrop too. It writes only when the theme or the blend moves, and then only the settings it moves, so a value set by hand survives until the theme moves that very setting; one in its `keep` Set (the panel's `locked`) survives that too, and catches up with the theme as soon as Reset puts back what was last written into it. `PARTICLE_THEME_KEYS` lists the settings it can write, which the particle panel makes `lockable`. `index.html` calls it every frame and, when it reports a write, calls `refresh()` on the panel that `createSettingsPanel` returns, naming the writer it returns (`'sequence'` while one plays, `'music'` while the music holds the clock, `'theme'` otherwise) — the controls of the settings it wrote catch up, and the values they land on become what Reset returns to, in the writer's colour where they differ from the defaults, while a setting changed from the panel and not written since keeps its amber mark and its Reset value. Anything else that writes settings from outside the panel has to do the same.

### `tools/re/` — reverse-engineering tooling

Python tools (standard library only, except `ppu_prx.py`, which needs capstone) that read the user's own PS3 firmware (for example an RPCS3 install): a `.qrc` extractor, an SPU disassembler, a matcher that uses RPCS3's SPU cache to show which code actually ran, a Cg binary (`.vpo`/`.fpo`) inspector that recovers uniform values from RPCS3's shader cache and maps the constants of RPCS3's decompiled fragment programs back to uniforms, a reader for RPCS3 RSX frame captures (vertex constants and vertex buffers per draw call), and a PPU module loader and disassembler. `tools/re/README.md` has the workflow. They write into `re-work/`, which is gitignored — **firmware files (ELFs, `.qrc` contents, textures, decompiled shaders) must never be committed**. `WAVE_REVERSE_ENGINEER.md` (an index into `docs/wave/`), `PARTICLES_REVERSE_ENGINEER.md` (an index into `docs/particles/`) and `BACKGROUND_REVERSE_ENGINEER.md` (an index into `docs/background/`) are what the tools have found about the wave, the particle system and the backdrop.

### `dds/` — gradient extraction tool

Standalone browser tool (ES modules) used to produce the month presets. `dds-reader.js` parses DDS (DXT1/3/5 and masked uncompressed formats) in pure JS; `gradient-fit.js` brute-forces the gradient angle and runs per-channel linear regression to fit a 2D linear gradient, reporting RMSE; `export-code.js` emits JS preset source. The exported record shape (`width`/`height`/`rmse` included) does not match what `background-gradients-*.js` actually stores (`angleDeg`, `colorStart`, `colorEnd`), so exported output is trimmed by hand when pasted in. The `.dds` source files are firmware assets and are not in the repo.

## Conventions

- `'use strict'` at the top of every `ps3xmbwave/` file, with the logic files wrapped in an IIFE; two-space indent; single quotes in `ps3xmbwave/` (double quotes in `dds/`).
- Every `ps3xmbwave/` file except the two `background-gradients-*.js` data tables opens with a two-line header comment stating what it produces and which files consume it — keep this up to date when dependencies shift.
- Settings files are declarative only: no runtime logic in `*-settings.js`.
- `old-research/` is a frozen archive (uses regl + stats.js). Don't refactor it or import from it; it exists for reference only.

## Keeping the notes

The wave's, the particles' and the backdrop's notes are built the same way: an index at the root (`WAVE_REVERSE_ENGINEER.md`, `PARTICLES_REVERSE_ENGINEER.md`, `BACKGROUND_REVERSE_ENGINEER.md`) with *Topics*, *Status* and *Still missing*, over topic files in `docs/wave/`, `docs/particles/` or `docs/background/`, one of which, `history.md`, holds what everyday work does not need. These rules apply to all three; each index's own *Keeping these notes* adds what is particular to it.

- **Read narrowly.** The index first, then the topics the task needs. To find an address, a function or a parameter, search for it (`grep -rn 0x2dde4 docs/`) rather than reading every file. `history.md` is for reopening a closed question.
- **Write what is known now.** A finding goes into its topic, and a reading it overturns is corrected where it stands, not answered by a new section further down. How it was found (which captures, at what time, the leads that failed) goes in the commit message, and in `history.md` only if it is worth keeping beside the notes.
- **Close the loop in the index.** When a question opens or closes, update the index's *Status* and *Still missing* in the same commit.
- **Retire what is superseded.** A reading that no longer holds leaves its topic; git keeps it. A dead end that would save someone the search gets a line under *Ruled out* in `history.md`.
- **Keep the scene's shared ground in one place.** The camera, the parameter sets, the day cycle and the scene's events belong to the whole scene, and the particle notes describe them. What any pass finds about them goes there; the wave's and the backdrop's notes link to it and keep only what concerns them alone.
- **Mind the size.** Keep each index under 8 KB and each topic under 15 KB. A topic that outgrows it is split by subject, and the new file goes into the index's *Topics*.
- **Don't restate the code.** Constants and their addresses are commented in `ps3xmbwave/`, and a bench's figures live only in its notes' `implementation.md`, replaced when it runs again rather than added to.
- **Methods go with the tools.** How to read savestates and captures, and how to get RPCS3 where a reading needs it, is in `tools/re/README.md`.
