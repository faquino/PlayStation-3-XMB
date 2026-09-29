# The firmware: where the scene lives

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the files the particles come
from, their parameters, and the PPU modules around them.

## Where the particle system lives

- `dev_flash/vsh/resource/qgl/lines.qrc` holds the whole "lines" scene (wave and particles):
  SPU tasks, RSX shaders, textures and parameter files. It is a zlib-compressed tree of
  files; `tools/re/qrc.py` documents the format.
- `dev_flash/vsh/module/custom_render_plugin.sprx` (PPU, encrypted) runs the scene: it fills
  the particles' parameter block, writes their flow grid and runs the tasks on a SPURS
  instance, which the RPCS3 log names `SceQglLinesCellSpursKernel0`, with handlers
  `SceQglLinesSpursHdlr0/1`. `qglbase.sprx` is the QGL engine under it and holds the names of
  all the QGL containers, `lines.qrc` among them. See [The PPU side](#the-ppu-side-in-progress).

| File in `lines.qrc` | What it is |
|---|---|
| `spurs/particles/particles/particles.elf` | The simulation: an SPU ELF run as a SPURS task |
| `PARTICLES.mnu` | The system's 52 parameters, as plain text |
| `PARTICLES_UI.mnu` | Interaction parameters: Sixaxis shake, D-pad, icon wind |
| `PARTICLES_SPE.mnu` | 5 offsets the PPU adds to parameters of the other file, weighted by two factors: one the XMB switches on and off, one set by the video output |
| `override/<theme>/PARTICLES.mnu` | Full parameter sets per theme and moment |
| `lib/particles/particles_quads.vpo/.fpo` | Main particle shaders |
| `lib/particles/particles_second.vpo/.fpo` | Second particle pass, adds glare |
| `lib/particles/particles_quads_debug.*` | Debug variants, never run |
| `particles/proc_iridescent.tga` | 128×128 RGBA colour table read by the fragment shaders |

## `particles.elf`

**Verified.** Stripped SPU ELF, built with GCC 4.1.1 (SDK 420). Same section layout and
startup code as `spline.elf`, entry `0x3070`.

| Section | Address | Size |
|---|---|---|
| `.text` | `0x03060` | `0x7930` (7756 instructions) |
| `.rodata` | `0x0a9f0` | `0x04b0` |
| `.data` | `0x0af20` | `0x0020` |
| `.bss` | `0x0af80` | `0x2520` |

**Verified: this is the code the XMB runs.** RPCS3's SPU cache for `vsh.self` holds 424
compiled programs whose words equal `particles.elf` at the same addresses. They cover 63.3%
of `.text` (4909 words), recorded without a controller configured.

The largest stretches that never ran are the first place to look for input-driven code:
`0x08a74-0x08ff4` (352 words), `0x0762c-0x07ad0` (297), `0x085c8-0x08a38` (284),
`0x0a374-0x0a738` (241), `0x09040-0x093a8` (218). Recording coverage again while using a
controller will show which of them handle the Sixaxis and the D-pad.

## Parameters

**Verified.** `.mnu` files are `#MNU_1.0` followed by `name:float:value` lines.

`PARTICLES.mnu`, grouped by meaning (the grouping is inferred from the names):

- **Emission:** `emit vel min` 0.15064, `emit vel mul` 0.19, `emit vel var` 0.282567,
  `emit cone angle` 51.8695, `emit neg prob` 0.173899, `emit vel zscale` 0,
  `emit per frame` 16.6539, `emit prob` 0.479115
- **Life:** `aging speed` 0.00285223, `aging variance` 0.493003
- **Dynamics:** `friction` 0.030551, `spin time scale` 2.74, `delta time` 0.0088883,
  `gravity` -6.8e-05, `wind dir x/y/z` (0.340188, 0, 0.35), `wind scale` 0,
  `wind scale 10` 0, `brownian scale` 0.225311
- **Lighting:** `spot pos x/y/z` (4.16, 2.63, -7.6), `spot attn x/y/z` (1, 0, 0),
  `specular power` 35.2904, `specular coeff` 74.74, `lambert coeff` 8,
  `exposure` 0.0390458, `fresnel` 1.33319, `color_control` 1, `iridescent exp` 1,
  `global alpha` 1
- **Size and focus:** `size middle` 0.0536233, `size near` 0.0772033, `size far` 0.874062,
  `near focus` 6.12435, `near focus_dist` 1.3193, `near focus_pow` 2.47206,
  `near darkness` 6.24028, `near fuzziness` 3.79, `far focus` 12.8327,
  `far focus_dist` 3.54129, `far focus_pow` 1.83324, `far darkness` 13.9
- **Alignment and glare:** `near align` 0.722, `size align` 13.19, `glare` 0.159705,
  `glare scale` 5.44386, `glare p1` 0.99, `glare p2` 4.44

`PARTICLES_UI.mnu`: `brownian` 0.60, `rshake brw` 7.4992, `dpad rot max` 0.000116654,
`dpad scale x` 1, `dpad scale y` 0, `dshake rot max` 0.000124431, `dshake rot imp` 0.513834,
`dshake brw imp` 0.061702, `dshake thresh` 0.722145, `dshake x coeff` 0.402735,
`dshake g coeff` 0.444397, `icon wind` 11.3877, `icon wind scl x` 0, `icon wind scl y` 1.

`PARTICLES_SPE.mnu`: `delta time` 0.00346295, `glare` 0.0832176, `specular power` -29.3657,
`size middle` 0.0218883, `global alpha` -0.555603. They are offsets: every frame the PPU adds
them to the same five parameters, weighted by two factors - see
[The parameters, as the PPU holds them](parameter-block.md#the-parameters-as-the-ppu-holds-them).

## The PPU side (in progress)

Decrypted with RPCS3 (*Utilities → Decrypt PS3 Binaries*) and read with
`tools/re/ppu_prx.py`. Imports are named with `tools/re/nids.py`. The NID formula
(SHA-1 of name + suffix, first four bytes little-endian) is **verified** on the VSH's own
imports.

| Module | Role |
|---|---|
| `vsh.elf` (`vsh.self`) | Creates SPURS instances: imports only `_cellSpursAttributeInitialize`, `cellSpursAttributeSetNamePrefix`, `cellSpursAttributeSetMemoryContainerForSpuThread`, `cellSpursInitializeWithAttribute`, `cellSpursFinalize`. |
| `custom_render_plugin.prx` | The XMB's QGL scene: the wave, the particles, the icons, the backdrop, the rays and the HDR pass, with a menu for each parameter file. It creates the `SceQgl` SPURS instance and the tasks, fills the particles' parameter block and writes their flow grid. |
| `qglbase.prx` | The QGL engine: resource banks, the `.mnu` parser, a small script language (`$FRAME_COUNT`, `goto`, `repeat … until`), the debug GUI, RSX setup through the VSH's `sdk` library. |
| `qgl_gaia_app.prx` | The Earth scene, the lines scene's override names, and the same per-scene SPURS task manager: prefix `"SceQgl"` + scene name, tasksets, tasks, event flags (28 named `cellSpurs` imports). **Not loaded in the XMB.** |
| `qgl_canyon_app.prx` | The canyon theme. **Not loaded in the XMB.** |

Findings so far:

- **Emission goes through a free-slot list**, which the task keeps - see
  [The free-slot list](spu-task.md#the-free-slot-list).

- **The emitter is in `custom_render_plugin`**, beside the code that fills the block - see
  [The emitter](emitter.md#the-emitter). None of the modules searched before it holds the particle
  parameters' names, which it holds as menu labels. The scene code is reached through C++
  virtual calls.
- The lines scene leans on `qglbase` (inferred from the RPCS3 log). Right before
  the `SceQglLines` SPURS instance is created, `qglbase` allocates memory and the RSX I/O
  mappings of the wave (`io 0x500000`) and particle (`io 0x600000`) buffers are set up.

### The XMB runs `custom_render_plugin`, not `qgl_gaia_app`

**Verified** from the savestates. A loaded PRX module keeps its module info record in memory -
attributes, version 1.1, a 28-byte name, then its TOC and the bounds of its export and import
tables - so a savestate lists what is loaded. Five savestates list 40 to 47 modules, with
`qgl_base_module`, `xmb_plugin_module` and `custom_render_module` in every one and
`gaia_app_module` and `canyon_app_module` in none; nor is `qgl_gaia_app`'s code in memory, in
the one savestate searched for it. `custom_render_plugin` carries both modules' paths under
`/dev_flash/vsh/module/` and imports from both, so it seems to load them only when it needs
them (inferred).

`custom_render_plugin` is the lines scene, and more:

- its strings name `LinesAppLayer`, `LinesLayer`, `ParticlesLayer`,
  `CustomParticleVramAllocator`, and the menus `LinesMenu`, `BackMenu`, `RaysMenu`, `HDRMenu`,
  `ParticlesMenu`, `ParticlesInteractionMenu` and `ParticlesHackMenu`, which list the
  parameters of `PARTICLES.mnu`, `PARTICLES_UI.mnu` and `PARTICLES_SPE.mnu` by name;
- it holds the override names the lines scene's sets live under, the `ICONS` menu and the
  icons' shaders, so the code that draws the icons and the code that fills the particle block
  are in one module;
- it creates the SPURS instance with the `SceQgl` prefix, and `0x53cd0` launches the task
  exactly as `qgl_gaia_app`'s `0x46590` does: the argument's second word is `object + 0x200`,
  the list of 56-byte records the task walks, with event flags at `+0x80` and `+0x100`, a
  three-word descriptor at `+0x180`, the local-store pattern at `+0x318` and the pointer to the
  SPU ELF at `+0x328`. `cellSpursCreateTask` is reached through a wrapper at `0x53c84`.

So what was found in `qgl_gaia_app` - the task manager, whose launcher there is reached by a tail
call from `0x48ce8`, in a class with its vtable at `0xa4190`, and the lines scene's override names -
is a copy of what the XMB runs from here. The earlier reading, that every SPU task comes from
`qgl_gaia_app`, rested on `qglbase` and `qgl_canyon_app` importing no `cellSpurs` function, and
never looked at this module.
