# PlayStation 3 XMB particles: reverse engineering notes

The goal is a faithful reimplementation of the XMB sparkles, including how they react to the
Sixaxis and to icon navigation. What is still open is listed under [Still missing](#still-missing).

Everything here comes from firmware 4.93 as installed in RPCS3, analysed with the tools in
[`tools/re/`](tools/re/README.md). **Verified** means checked against the firmware files or
against what RPCS3 recorded while running the XMB; anything else is marked as inferred.
**Modelled** marks what the implementation in `ps3xmbwave/` supplies until the code is found.

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
| `PARTICLES_SPE.mnu` | 5 offsets the PPU adds to parameters of the other file, weighted by two animated factors |
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
them to the same five parameters, weighted by two animated factors - see
[The parameters, as the PPU holds them](#the-parameters-as-the-ppu-holds-them).

### Theme overrides

Each `override/<theme>/PARTICLES.mnu` is a complete parameter set. Differences from the base:

| Theme | Changes |
|---|---|
| `night` | `far focus_dist` 4.09678 |
| `day` | `size middle` 0.0464771, `far focus` 12.2008, `far focus_dist` 4.02735, `glare` 0.201367 |
| `yoake` (dawn) | `far focus` 12.0064, `far focus_dist` 4.02735, `glare` 0.180536 |
| `higure` (dusk) | `size middle` 0.0464771, `far focus` 12.6869, `far focus_dist` 4.02735, `glare` 0.18748 |
| `black`, `music_1` | `size middle` 0.0464771, `far focus` 12.0064, `glare` 0.201367; `black` also `global alpha` 0 |
| `coldboot1/2` | as `black`, plus `emit vel mul` 3.7496 |
| `gameboot3/4` | 19 changes, including `delta time` 0.08; `gameboot4` also sets `global alpha` 0 |
| `welcome_1/2` | 31 changes, including `emit per frame` 70.5765 |

**The numbering is a sequence, not a duplicate.** `welcome_1` and `welcome_2` carry the same
`PARTICLES.mnu`, and so do `coldboot1` and `coldboot2`, which is why only one of each is in
`particles-themes.js` - but their other three files differ, so the console is walking a chain of
stages. `welcome_1` opens at a 158.7 degree field of view with a corner colour of (0.34, 1.16,
10); `welcome_2` closes at 81.24 with (0.12, 6.24, 8.93). Both run `EXPOSURE` 3.404 against the
base 1.05. `gameboot1` to `gameboot5` walk from a white corner through two black stages - the
third and fourth being the ones that touch the particles, the fourth with `global alpha` 0 -
and back out to white.

### The XMB starts by fading out of `coldboot1`

Five captures taken during start-up, across two boots, say what the opening transition is - and
it is not `welcome`. Fitting each capture's twelve corner channels against every pair of sets
lands on the same answer three times, to within 6e-7, which is float noise:

| Capture | Blend | Factor | Particles alive |
|---|---|---|---|
| 18:21:00 | `coldboot1` into the cycle's set | 0.458315 | 492 |
| 18:21:07 | same | 0.842647 | 1317 |
| 18:22:52 | same | 0.996244 | 2019 |
| 18:23:04 | settled | 1 | 2022 |
| 18:23:18 | settled | 1 | 2004 |

The particles' `glare` agrees on where it comes from: 0.201367 in the first two, which is
`coldboot1`'s value where the cycle at that hour would be holding `higure`'s 0.18748 - and
0.18748 exactly in the last two. But it does not agree on when: it was still sitting on the
coldboot value with the backdrop 84 per cent of the way across, and read 0.188132, 95 per cent,
where the backdrop was at 99.6. At boot the particle side trails the backdrop by much more than
the twentieth of a second it trailed by during the music change.

**And the pool fills from empty.** The draws carry 492 particles, then 1317, then 2019 and
about 2020 from there on. The console opens the XMB with nothing in the air and lets emission
fill it; `ps3xmbwave/` instead pre-warms 300 steps on its first frame, so the page opens full.
That is a deliberate difference, not a missing piece.

RPCS3 boots `vsh.self` directly, so what these captures see is the tail of the console's own
boot: the XMB coming up out of the `coldboot` sequence. Where `welcome_1` and `welcome_2` sit -
power-on, or coming back from a game - is still open, and this path does not go through them.

**The `gameboot` path is closed under RPCS3**, which cannot launch a game from the XMB, so
neither the boot sequence nor the return from it can be captured there. Every value of those
sets is already read out of the `.mnu` files; what stays unknown is the order the five stages
run in and how long each takes.

**The first-run wizard does not run this scene at all.** Removing `dev_flash2` and `dev_flash3`
brings the wizard up (renaming the user profile does not - the XMB starts as if nothing
happened), and eight captures taken across it, from 19:31:30 to 19:34:26, have no wave, no
particles and no backdrop draw between them: 10 to 47 draws each, all the wizard's own. So
whatever `override/initial_setting` configures, it is not those screens. And when the XMB
finally comes up afterwards it is the same opening as ever - `coldboot1` into the cycle's set,
a third independent sighting, at 0.474, 0.890 and 0.99995 with 436, 1585 and 2042 particles in
the air. No `welcome` in any of it.

That leaves `welcome_1` and `welcome_2` unplaced, and suggests where they are: RPCS3 skips the
console's own cold-boot intro, and those two sets read like it - a 158.7 degree field of view
closing to 81.24, exposure at 3.404, colour channels at 10 where nothing else goes past 1. A
white flash opening into the machine. `coldboot1` would then be the tail of that same sequence,
the part the XMB itself draws, which is exactly where we keep finding it.

**A capture inside the saved-data utility rules that screen out.** Its corner colours are the
base ones to the last digit and its `glare` is the cycle's, so the utility does not change the
parameter set at all: the way it dims the XMB's icons and defocuses the backdrop happens
outside `lines.qrc`. The scene carries 94 draws against the plain XMB's 77, with the same
twelve Gaussian passes in both, so the extra ones are the utility's own.

That capture did leave something, though: taken at 19:00:49, 49 seconds into the dusk-into-night
window, it reads `glare` 0.187479 where the cycle predicts 0.1874790. The window had turned over
one part in thirty thousand of its length and the value had already moved by one part in a
million, in the right direction. The wizard captures land another of those: at 19:34:54, 0.185898
against a predicted 0.1858885.

`tools/re/whichset.py` does this matching, for any capture: it fits the four corner colours
against every pair of sets and reads the particles' `glare` beside them.

### Telling the sets apart in a capture

Since a capture carries the corner colours as vertex constants and the particles' `glare` inside
the microcode, these four numbers name the set on screen, or the pair being crossfaded:

| Set | corner 1 | corner 4 | `FOVY` | `COLOUR SHADER` | `EXPOSURE` | `glare` |
|---|---|---|---|---|---|---|
| base | 1, 1, 1 | 0.925, 0.923, 0.923 | 71.85 | 0 | 1.05 | 0.159705 |
| `yoake` | = base | = base | 71.85 | 0 | 1.1 | 0.180536 |
| `day` | = base | = base | 71.85 | 0 | 1.05 | 0.201367 |
| `higure` | = base | = base | 71.85 | 0 | 1.2 | 0.18748 |
| `night` | = base | = base | 71.85 | 0 | 1.41 | 0.159705 |
| `music_1` | 0.579, 0.435, 0.472 | 0.5, 0, 0.5 | 83.2 | 1 | 1.51 | 0.201367 |
| `black` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1.41 | 0.201367 |
| `bright` | = base | 0.925, 0.924, 0.924 | 71.85 | 0 | 1.356 | - |
| `initial_setting` | 0, 0, 0 | 1, 0.9995, 0.9995 | 72 | 0 | 1.41 | - |
| `coldboot1` | 0.0021 grey | 0, 0, 0 | 71.8 | 0 | 1.64 | 0.201367 |
| `coldboot2` | = base | = base | 71.85 | 0 | 1.05 | 0.201367 |
| `gameboot1` | 0.0021, 0.0022, 0.0023 | 1.012, 0.952, 0.968 | 71.93 | 0 | 1.392 | - |
| `gameboot2` | 0.8, 0.8, 0.8 | 0, 0, 0 | 72 | 0 | 1.41 | - |
| `gameboot3` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1 | 0.423566 |
| `gameboot4` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1.41 | 0.423566 |
| `gameboot5` | 0, 0, 0 | 1, 0.9995, 0.9995 | 72 | 0 | 1.41 | - |
| `welcome_1` | 0.343, 1.157, 10 | 0.775, 1.814, 0.697 | 158.7 | 1 | 3.404 | 0.222198 |
| `welcome_2` | 0.123, 6.237, 8.927 | 0.228, 2.143, 10 | 81.24 | 1 | 3.404 | 0.222198 |

The day-cycle sets share the base backdrop, so only `glare` separates them - which is what the
cycle was measured with. Everything else has a corner colour of its own, and the two `welcome`
stages are unmistakable: no other set puts a colour above 1, let alone at 10.

**Verified: overrides apply at run time.** The glare value the XMB fed `particles_second`
was 0.201367, an override value rather than the base 0.159705.

**Measured: `music_1` is playback, not the column.** Two savestates taken with the cursor
resting on the Music column, at 20:02 and 20:11, hold neither of the set's markers - `far
focus` 12.0064 occurs nowhere in either image, nor does `glare` 0.201367 - while the values
the running dusk-into-night blend was passing through occur in the hundreds. A savestate taken
later with a track actually playing settles it: the live `_Glare` reads **0.201367 exactly**,
the set's own value, at 23:34, where the day cycle would be holding night's 0.159705. So the
set replaces the cycle outright rather than blending with it.

Getting music into the XMB under RPCS3 needs the media database rebuilt - dropping files into
`/dev_hdd0/music` leaves them invisible, because nothing scans that folder (RPCS3 issue #18601;
deleting `/dev_hdd0/mms` forces the rebuild).

**And the set reaches the whole scene, not just the particles.** `override/music_1/` carries
four files, and all four differ from the base:

| File | What changes |
|---|---|
| `PARTICLES.mnu` | the three values above |
| `LINE1.mnu` | 11 of 35: the wave rises and comes forward (`POS Y` -1.08844 to 0, `POS Z` -6.40287 to -5.2), turns (`ANG Y` 0.0867576 to 0.796751, `ANG ROT` 18.1208 to 13.1208), slows (`TIMESTEP` 4 to 3.72102), and its free-form deformation is rescaled |
| `HDR.mnu` | 10 of 17: `EXPOSURE` 1.05 to 1.51, `GLARE LEVEL` 1.10245 to 2.46, `GLARE THRESH` 0.738857 to 0.260814, wider Gaussian radii - the whole image blooms harder, which is why the wave reads as lit more strongly |
| `BACKGROUND.mnu` | all 14: the four corner colours go dark and magenta (corner 2 to black, corner 4 to 0.5, 0, 0.5), `FOVY` 71.846 to 83.2002, and `COLOUR SHADER` 0 to 1 |

**The GPU side of that table, from four frame captures taken with a track playing.** All four
read a live `_Glare` of 0.201367, the set's own value and steady across the 47 seconds they
span, so the transition was over before the first. The backdrop's four corner colours arrive
as vertex constants and are the set's, exactly: `c[464]` (0.5, 0, 0.5), `c[465]` (1.2, 1, 1.1),
`c[466]` (0.579004, 0.435001, 0.472), `c[467]` (0, 0, 0) - corner 4's magenta and corner 2's
black, which is the screen. The wave's own draw (`lines1`, 16384 vertices) carries only its
shading parameters, `MIPMAP BIAS` 1.86707, `BRIGHTNESS` 0.701917 and `FRESNEL` 0.638971, all
three the base values that this set does not touch, and its transform is the identity with z
flipped. So the wave's move is not in a matrix: the vertices arrive already placed. Comparing
the two buffers, over all 16384 vertices:

| | 21 September, no music | 24 September, playing |
|---|---|---|
| mean y | 0.536 | 2.406 |
| mean z | 8.080 | 6.965 |

It comes forward by 1.115, against the 1.203 that `POS Z` moves in the file, and rises by 1.87,
more than `POS Y`'s 1.088 on its own - the rest is `ANG Y` turning the whole band.

**Changing set is one crossfade, about eight seconds long.** Three more captures, seven and
eight seconds apart, caught it running. The backdrop's corner colours give the factor twelve
times over - four corners, three channels each - and they agree:

| | blend factor from the twelve channels | particle `glare` | as a factor |
|---|---|---|---|
| 00:28:55 | 0.146767 to 0.146771 | 0.165444 | 0.137751 |
| 00:29:02 | 0.999433 to 0.999448 | 0.201307 | 0.998560 |
| 00:29:10 | 1 | 0.201367 | 1 |

So the whole set is walked by a single number, the same shape as the day cycle. Its length is
only bounded: Alt+C freezes the emulation until the pad resumes it, so the seven and eight
seconds between the captures' timestamps are wall clock and include the freezes. A straight
line through the two interior points gives 8.2 seconds and a smoothstep 9.4, and the truth is
shorter than that by however long the machine stood still.

**The curve looks eased rather than straight**, on this argument: the particles trail the
backdrop by 0.009017 in the first capture and 0.000875 in the second, a ratio of ten. A
constant lag - the parameter block reaching the SPU a frame or two late, about a twentieth of
a second here - opens a gap proportional to how fast the factor is moving, so on a straight
line both gaps would be equal. A smoothstep's slope at those two points differs by 13.7 times.
The argument rests on the lag being a constant time, so it is a lean, not a proof.

The wave moves in the same window, and its geometry says so: mean y over the 16384 vertices
runs 0.536 with no music, 0.701 at the 15 per cent point, then 2.432 and 2.400 at the end -
against 2.406 in a capture taken ten minutes later with everything settled.

`ps3xmbwave/` applies only the particle column of that table. The rest - the wave's place and
tilt, the tone mapper, the backdrop without a month in it - waits for the wave's own pass,
where an override mechanism for `LINE1.mnu`, `HDR.mnu` and `BACKGROUND.mnu` would carry all
the hidden sets at once, not just this one.

## Shaders

**Verified** from the Cg binaries' parameter tables (`tools/re/cgbin.py`).

`particles_quads.vpo`, 135 instructions:

- Per-particle inputs: `IN.pos` (ATTR0, float4), `IN.uv0` (ATTR8, float2),
  `IN.rot` (ATTR11, float4, a quaternion). `IN.old_pos` (ATTR10) is declared but unused
  here.
- Uniforms: `_ModelviewProjection` c[256], `_Modelview` c[260], `_LightPack` c[264],
  `_Darkness` c[459], `_LifeBoundsMax` c[460], `_LifeBoundsMin` c[461], `_NearControl` c[462],
  `_FrontFacingQuaternion` c[463], `_FocusCurves` c[464], `_Focus` c[465],
  `_Transparency` c[466], `_ParticleSize` c[467].
- Compiler constants c[457]/c[458] hold the coefficients of the Cg standard library's
  `atan2` (0.999996, 0.332995, 0.195636, 0.121239, 0.0574773, 0.0134805) and π/2, so the
  shader computes an angle.
- Outputs to the fragment shader: `uv0`, `uv2`, `uv3`, `normal`, `pos`, `normal_v`.

`particles_quads.fpo`, 123 instructions: reads those six varyings, samples
`_IridescentTex`, and uses `_LightPack`, `_Color`, `_NearControl`, `_IridescentExp`,
`_Gamma`. `particles_second.fpo` (97 instructions) adds `_Glare`.

### Uniform values at run time

RSX fragment programs embed their uniforms in the microcode, and RPCS3 caches the
microcode as it was uploaded, so its cache holds the values the XMB used.

**Verified:** `particles_quads.fpo` is cache entry `1EB87F9FA7CE69C.fp`, and
`particles_second.fpo` is `ABCA7B86F40031C0.fp`. The vertex programs are
`B9772382535D84E4.vp` and `D19B154BC25B271B.vp`.

| Uniform | Value at run time | Parameters |
|---|---|---|
| `_LightPack` column 1 | (4.16, 2.63, -7.6, 35.2904) | `spot pos x/y/z`, `specular power` |
| `_LightPack` column 2 | (1, 0, 0, 0) | `spot attn x/y/z` |
| `_LightPack` column 3 | (8, 74.74, 0.0390458, 1) | `lambert coeff`, `specular coeff`, `exposure`, then 1 |
| `_LightPack` column 0 | (0, 0, 2, 1) | the eye position (inferred, see below) |
| `_NearControl` | (13.19, 3.79, 0.722, 0) | `size align`, `near fuzziness`, `near align` |
| `_Glare` | (0.201367, 5.44386, 0.99, 4.44) | `glare`, `glare scale`, `glare p1`, `glare p2` |
| `_IridescentExp` | 1 | `iridescent exp` |
| `_Color` | (1, 1, 1) | |
| `_Gamma` | 1 | |

Vertex uniforms live in constant registers and are not in the cache. Their values come
from the RSX frame captures below; their meaning from the decompiled vertex shader.

### Decompiled shaders

**Verified.** With `Log shader programs` enabled, RPCS3 decompiles every cached program
to GLSL when the XMB boots, into `shaderlog/`. They are identified by their inputs:

| Program | Log file (ids can change between runs) | How it was identified |
|---|---|---|
| `particles_quads.vpo` | `VertexProgram34` | Only two programs read attribute 11 (`IN.rot`); this is the shorter |
| `particles_second.vpo` | `VertexProgram38` | The other one |
| `particles_quads.fpo` | `FragmentProgram53` | Reads exactly TEXCOORD 0, 2, 3, 4, 5, 7 |
| `particles_second.fpo` | `FragmentProgram55` | Same without TEXCOORD2, matching its attribute mask |

RPCS3 renumbers the vertex constants a program uses into a compact list,
`_fetch_constant(0..23)`. **Verified** from how each index is used (factor 2 in the
quaternion-to-matrix conversion is `c[456].x`, `w = 1` is `c[458].x`, and each uniform
only touches the components its type has):

| Compact | Register | Uniform |
|---|---|---|
| 0–3 | c[256–259] | `_ModelviewProjection` |
| 4–7 | c[260–263] | `_Modelview` |
| 8–10 | c[264–266] | `_LightPack[0–2]` (row 3 is unused here) |
| 11–14 | c[455–458] | compiler constants |
| 15–23 | c[459–467] | `_Darkness`, `_LifeBoundsMax`, `_LifeBoundsMin`, `_NearControl`, `_FrontFacingQuaternion`, `_FocusCurves`, `_Focus`, `_Transparency`, `_ParticleSize` |

For the fragment programs, `tools/re/cgbin.py --fc-table` maps each `_fetch_constant(n)`
to the uniform or literal behind it, from the embedded constant slots.

### How the two passes work

**Verified** from the four decompiled programs, read with the constant maps above.
`ps3xmbwave/particles.js` re-authors both passes from this reading.

Both vertex programs start from the same terms. Let d be the distance from the particle
to the eye (`_LightPack` column 0), `_Focus` = (nf, ne, ff, fe), and ramp(x, a, b) =
saturate((x − a) / (b − a)).

- **Blur.** Near blur is 1 − ramp(d, nf, ne) and far blur is ramp(d, ff, fe). The curves
  are the blurs raised to the two `_FocusCurves` exponents.
- **Size.** size = mix(mix(`size middle`, `size near`, near curve), `size far`, far curve),
  in world units.
- **Apparent size.** a = 2 atan(size / d) / fovy. This is what the Cg library's `atan2`
  coefficients among the compiler constants are for. `_FocusCurves.z` (0.925025) is the
  vertical field of view, 53.0°.
- **Fade band.** band = 1 + ramp(d, ff − 0.2, ff) − ramp(d, ff − 0.6, ff − 0.4). Opacity
  falls to 0 for d between ff − 0.4 and ff − 0.2, then comes back.
- **Opacity.** The product of:
  - facing: 1 − (1 − |V·n|)^`fresnel`, with n the quad's normal;
  - `global alpha`;
  - the record's alpha;
  - the band;
  - 1 − saturate(far blur · a · `far darkness`);
  - 1 − saturate(near blur · a · `near darkness`);
  - a wall fade, smoothstep(saturate(5 × distance to the nearest `_LifeBounds` wall)).

**`particles_quads`, the flake.**

- **Turning to the camera.** The quad turns towards `_FrontFacingQuaternion` by
  align = saturate(a · `size align` + near curve · `near align` + ramp(d, ff − 0.4, ff − 0.2)),
  as q' = normalize(q + align · (front − q)).
  - Big and near-blurred particles face the camera.
  - The last term makes every particle past the far focus face it too. The fade band
    hides the turn.
- **Geometry.** The quad spans size × size along q′'s x and y axes. The lighting normal n
  stays that of q, the flake's own orientation.
- **Colour.** c = `_IridescentTex`(n_view.xy × 0.5 + 0.5)^`iridescent exp`, a matcap-like
  lookup by the normal in view space.
- **Lighting.** L, V and H are per fragment, from the corner's world position. With dL the
  distance to the spot:
  - I = (|n·L| · `lambert coeff` + |n·H|^`specular power` · `specular coeff` · c) /
    (attn.x + attn.y · dL + attn.z · dL²);
  - output = (1 − e^(−`exposure` · I)) · shape · opacity · `_Color` · `_Gamma`.
  - The diffuse part is white. Only the specular carries the iridescent colour.
- **Shape.** ρ is the distance from the quad's centre (1 at the middle of each edge).
  - b = saturate(near curve + far curve);
  - e = saturate((ρ − (0.45 − 0.6345 b)) / (0.1 + 1.269 b));
  - disc = 1 − smoothstep(e);
  - fuzz = mix(0.85, `near fuzziness`, near curve);
  - shape = disc + b · (1 − disc − e^(−disc · fuzz)).
  - In focus, this is a disc of radius about 0.5 with a thin edge. Blurred, it is a soft
    bokeh blob.

**`particles_second`, the glare.**

- **Geometry.** A camera-facing sprite, along the axes of `_FrontFacingQuaternion`, of size
  size · `glare scale` · |n·H|^`specular power`, with H at the particle's centre. It only
  has area while the flake mirrors the spot into the eye.
- **Opacity.** As above, with the front-facing normal.
- **Output.** (1 − e^(−`exposure` · `specular coeff` · |n·H|^`specular power` · c / atten))
  · opacity · `_Color` · `glare` · e^(−`glare p2` · ρ^`glare p1`) · `_Gamma`. There is no
  diffuse term, and the falloff from the centre is sharp.

`_LightPack`, as the programs read it:

| Column | Holds |
|---|---|
| 0 | the eye, (0, 0, 2, 1) |
| 1 | spot position, and `specular power` |
| 2 | the spot's constant, linear and quadratic attenuation |
| 3 | `lambert coeff`, `specular coeff`, `exposure`, then 1 |

**Blend state, verified from the captures.** Both particle draws and the wave's draw blend
additively (`ONE / ONE`), with depth test and depth writes off. The particle draws also
enable the alpha test. `ps3xmbwave/spline.js` still draws its wave with
`SRC_ALPHA / ONE_MINUS_SRC_ALPHA`.

### The iridescent texture

**Inferred, by fitting.** `proc_iridescent.tga` depends only on a spiral phase around its
centre:

- t = (θ − 0.025 r − 0.00006 r²) / 2π, where r is the distance in texels from (63.5, 63.5)
  and θ the angle, with y pointing down the image;
- averaging the colour by phase leaves no radial trend;
- a periodic Catmull-Rom curve through 16 colours reproduces it with an RMS error of 13/255
  (11/255 with 32);
- the colours run like thin-film interference: white, yellow, orange, magenta, violet,
  blue, lavender, pink, olive, and back to white.

`particles.js` builds the texture from those 16 colours at start-up. It never reads the
firmware texture.

## Frame captures

**Verified** from two RPCS3 RSX frame captures (`tools/re/rrc.py`), taken on 21 September
at 20:18 and 20:19 with the September theme, during and after a controller session. The
particles are draw 35 (`particles_quads`) and draw 36 (`particles_second`) of each frame.

### Camera

- `_Modelview` is a translation by (0, 0, -2): the eye sits at (0, 0, 2) looking down -z,
  unrotated. This is the `_LightPack` column that was unexplained.
- `_ModelviewProjection` rows (1.1282, 0, 0, 0), (0, 2.00569, 0, 0),
  (0, 0, -1.0002, 1.80038), (0, 0, -1, 2) give a perspective projection with a 53.0°
  vertical field of view, aspect 16:9, near plane 0.1 and far plane 1000.

### Vertex uniforms at the particle draw

| Uniform | Value | Parameters |
|---|---|---|
| `_Darkness` | (6.24028, 13.9) | `near darkness`, `far darkness` |
| `_LifeBoundsMin` / `_LifeBoundsMax` | (-10, -10, -12) / (10, 10, 7) | none; not in any `.mnu` |
| `_NearControl` | (13.19, 3.79, 0.722) | `size align`, `near fuzziness`, `near align` |
| `_FrontFacingQuaternion` | (0, 0, 0, 1) | identity |
| `_FocusCurves` | (2.47206, 1.83324, 0.925025) | `near focus_pow`, `far focus_pow`, then the vertical field of view in radians |
| `_Focus` | (6.12435, 7.44365, 12.7237, 16.7686) | `near focus`, `near focus` + `near focus_dist`, `far focus`, `far focus` + `far focus_dist` |
| `_Transparency` | (1.33319, 1) | `fresnel`, `global alpha` |
| `_ParticleSize` | (0.0482832, 0.0772033, 0.874062) | `size middle`, `size near`, `size far` |

### Themes blend over hours

`size middle` 0.0482832 and `far focus` 12.7237 appear in no `.mnu` file. Both are the
`higure` (dusk) and `night` sets mixed at the same t ≈ 0.2525, and `far focus_dist` mixed
the same way reproduces `_Focus.w`. The second capture, 58 s later, gives t ≈ 0.258.

Two samples 58 s apart cannot tell the shape of the curve apart from its length, but the
captures were taken at 20:18 and 20:19, and a smoothstep over four hours from 19:00 to
23:00 lands on t = 0.248 at 20:18. Reading the two sets at that t gives `size middle`
0.04825 against 0.0482832 captured, and `far focus` 12.7231 against 12.7237. A straight
line would instead take about three hours, from 19:34 to 22:30.

**The morning transition is the same shape, twelve hours earlier.** The parameter block
carries `size middle`, so the two savestates taken at 07:52 and 08:07 measure it again:
they sit 0.124 and 0.1915 of the way towards the set with `size middle` 0.0464771. A
four-hour smoothstep from 07:00 to 11:00 gives 0.1205 and 0.1903.

**A second parameter, `glare`, says where the morning starts.** The fragment programs
carry their uniforms inside the microcode, and the microcode the XMB uploaded is in
memory: searching a savestate for `glare scale`, `glare p1` and `glare p2`, which no theme
changes, with their float halves swapped as the microcode keeps them, finds the live
`glare` right before them. It reads 0.159705 at 23:03, exactly the night value, so the
evening transition is over by 23:00; and 0.183120 and 0.184526 in the two morning
savestates. Blending night into day at the mix above would give 0.1647. Blending `yoake`
into day gives 0.18304 and 0.18450. So the morning runs **from dawn into day**, and
`size middle` could not tell, since `yoake` keeps it where night has it.

**A savestate at 16:54 gives the third window, and with it the pattern.** Its `glare`
reads 0.187501, all but exactly the `higure` value, so day into dusk was 0.9985 of the way
through. Of the round-hour windows only 13:00 to 17:00 fits: it gives 0.187506. Twelve
o'clock would already be over, half past one would be at 0.94.

So the transitions start at 07:00, 13:00 and 19:00, four hours each, **every six hours**,
with two hours of one set in between, which puts the fourth at 01:00 and gives the holds it
implies: dawn from 05:00, day from 11:00, dusk from 17:00, night from 23:00.

**The fourth window, measured.** RPCS3's *Console time offset* moves the emulated clock
without waiting for the hour, and a savestate taken with it at 01:31 reads `glare` 0.160707.
Night into `yoake` puts that at 0.0481 of the way through. The predicted smoothstep is 0.0457
at 01:31 and 0.0486 at 01:32 - the savestate was written a minute after the screenshot, so it
lands at 01:31.9. A straight line over the same window would be at 0.133, nearly three times
as far, and a window opening at midnight would be at 0.36.

| Window | Blend | How it is known |
|---|---|---|
| 01:00-05:00 | night into `yoake` | one savestate, `glare` |
| 07:00-11:00 | `yoake` into `day` | two savestates, `size middle` and `glare` |
| 13:00-17:00 | `day` into `higure` | one savestate, `glare` |
| 19:00-23:00 | `higure` into night | two frame captures, `size middle` and `far focus` |

All four windows are measured, and against the six measured moments the cycle lands within
0.07%.

### The particle buffer

- The SPU writes one 32-byte record per particle into main memory. The RSX reads it with
  a vertex frequency divider of 4, so each record drives the four corners of a quad
  (primitive: quads). `uv0` is a separate static buffer of the four corners, repeated
  modulo 4.
- Record layout:
  - `+0x00`: position x, y, z and a fourth value w (4 × f32);
  - `+0x10`: rotation quaternion (4 × f16), unit length in every record;
  - `+0x18`: old position (4 × f16), zero in every record.
- 2028 particles in the first capture, 2041 in the second.
- In the first capture positions span x [-10, 10], y [-2.7, 4.3], z [-9.6, -2.4]. In
  both, w is exactly 1 for 92% of the
  particles and lower for the rest (5th percentile 0.60–0.67). It behaves like an opacity
  that drops at the end of a life (inferred).

### The wave

- `lines1.vpo` draws the wave from a 16384-vertex buffer in main memory, written by
  `spline.elf`. Positions are already in clip space: w is the view depth. A second vec4 is
  probably a normal (inferred), and uv is static.
- The buffer is 128 lines of 128 vertices, one line after the other: u is the line's index
  over 127, and along a line x runs from the right edge, 1.45 in normalised coordinates, to
  the left, -1.55.
- The particles fill the same depth slab as the wave: view z [-11.6, -4.4] against
  [-10.8, -4.5]. Projected to the screen, they cluster tightly around the wave and thin
  out with distance from it. They are born on its vertices - see [The emitter](#the-emitter).

### Controller input

During the session, a DualSense was pad 0; it was shaken, tilted, and used on the D-pad
across icons. In that time RPCS3 compiled no new SPU code for `particles.elf` or
`spline.elf`, and no vertex constant depends on input. So input reaches the particles as
data, in one of two ways:

- the task receives raw sensor values and handles them in code it always runs (SPU code
  is largely branch-free);
- or the PPU turns them into impulses first.

It is the second. The parameter block carries the result - see
[What the controller does to the block](#what-the-controller-does-to-the-block) - and
`custom_render_plugin` computes it - see [The controller](#the-controller).

## The update task

**Verified** from the disassembly of `particles.elf` (`tools/re/spu_disasm.py`). The
parameter offsets are verified; which `.mnu` value fills each one is inferred.

### What it does and does not do

`particles.elf` only updates live particles. It integrates their motion, ages them, spins
them, kills them, and writes the vertex records the shaders read. **It never creates a
particle.** Several things point that way:

- its only random number generator feeds a per-frame noise force;
- no code writes a new particle into a free slot;
- `main` hands the batch machinery a single callback, the update at `0x6ed0`.

Emission, the flow grid and the input-driven rotation are prepared by whoever fills its
parameter block: the PPU, in `custom_render_plugin` - see [The PPU side](#the-ppu-side-in-progress).

### Main loop (`main` at `0x80e8`)

For each 56-byte record in a list handed over by the PPU (one per particle system):

- GET 2304 bytes from the address at `+32` into `0xb200`: the parameter block, **P** below;
- GET 16 bytes from `+20` into `0xb000`, and PUT them back at the end: persistent state;
- process the pool in chunks of 512 particles (24576 bytes), 64 particles per update call;
- PUT 128 bytes from `0xb100` to `+28`, and 1024 bytes to `+44`;
- PUTF a 4-byte completion flag to `+36`.

A pool record is 48 bytes: position xyz plus life in w (0 to 1), velocity xyz plus aging
rate in w, and a rotation quaternion. **A free slot has position.w = -666.**

### Per live particle (`0x6ed0`)

1. **Flow grid.**
   - `g = M1 · (pos, 1)`, with M1 at P+1856.
   - Sample the grid of vectors at P+128 bilinearly at g (`FUN_000068e0`, `FUN_00003cb0`).
   - Bring the result back to world space: `flow = M2 · (sample, 0)`, with M2 at P+1792.
2. **Noise:** `n = r · P[2212] + P[2192]`, where r is a random vector.
   - Its three components come from three generators, one per axis:
     `s = s · 16807 mod 2³²`, value `asfloat(0x40000000 | s >> 9) − 3`, uniform in [−1, 1).
   - The seeds are reset every frame to 0x98756161, 0x21324889 and 0x82181158
     (`FUN_00004978`). So the k-th live particle processed gets the same vector every
     frame: a near-constant drift per particle rather than Brownian motion. It only
     changes when particles ahead of it in the pool die or are born.
3. **Force:** `F = P[0].xyz + n + flow · P[2208]`.
4. **Field rotation.**
   - `vel += (c + R · (pos − c) − pos) / dt`.
   - c is the point at P+2096.
   - R is the matrix at P+2112, rebuilt every frame from the rotation vector at P+2176
     (`FUN_000048b8`): its length is the angle and its direction the axis
     (`FUN_00004688`, vectormath's rotation). A vector shorter than 1e-5 gives the
     identity, so a turn slower than 1e-5 radians a frame does not happen at all.
5. **Integration:** `vel += (F − P[16] ⊙ vel) · dt`, then `pos += vel · dt`, with
   `dt = P[2224]`. These are vec4 operations, so life (pos.w) advances by the aging rate
   (vel.w).
6. **Spin.**
   - `ω = (sin(2π·0.37·life), cos(2π·0.17·life), cos(2π·0.31·life))`.
   - Then `q += ½ (ω ⊗ q) · P[2220]/60`, and q is renormalised.
   - Sine and cosine are the SPU SIMD math library's `sinf`/`cosf`. The two differ only by
     the cosine's quadrant offset.
7. **Death:** life ≥ 0.99999, or the position leaves the box [P+2048, P+2064], which is
   `_LifeBounds` in the shader. The slot becomes free.
8. **Output** (32 bytes):
   - `(pos.xyz, alpha)`, with `alpha = min(life, 0.02) · 50 · (1 − max(life − 0.94, 0) · 16.6667)`;
   - then q as four halves;
   - then the unused old position.

Cross-check with the captures: alpha is exactly 1 for life in [0.02, 0.94], 92% of a life,
and exactly 92% of the captured particles have w = 1.

The next section reads the parameter block out of memory, which settles what fills it.

## The parameter block, read out of a savestate

**Verified.** An RPCS3 savestate (*File → Create savestate*, 0.0.42) holds the emulated
PS3's memory. The file is zstd-compressed around a `RPCS3SAV` stream, so Python's
`compression.zstd` opens it. Searching the 55 MB for `_LifeBounds` as a float triple, and
for the time step as three equal floats followed by 1, finds the block four times: twice
in main memory, one after the other, and twice inside the local store of an SPU thread,
where the task receives it at `0xb200`.

**The block is the task's whole 2304-byte transfer, and the savestate stores it shorter.**
A savestate leaves out every 128-byte line of memory that is entirely zero, and the
transfer has twelve of them between the drag and the rest - an empty flow grid, below - so
the savestate holds 768 of its bytes. A frame capture keeps memory whole, and there the
transfer is laid out exactly as the disassembly reads it: the force and the drag at +0 and
+16, the flow grid from +128, everything else from +1792. Dropping the all-zero lines from
a capture's transfer gives the savestate's layout byte for byte, at rest and while
navigating. The offsets below are a resting savestate's: past the drag, the transfer's are
1536 higher, which is how the task's own `P+2048` and the rest address them. This replaces an
earlier reading, that the task DMAs three 768-byte structures and takes its force from the
head of the third: that head is zero in every capture.

| Offset | Field | In the savestate | Source |
|---|---|---|---|
| 0 | constant force | (0, -6.8e-05, 0, 1) | `gravity`, alone: the wind goes to +656 |
| 16 | drag | (0.030551, 0.030551, 0.030551, 0) | `friction` |
| 256 | M2, grid vector to world | diag(15.9546, 8.97447, 1), translation (-7.9773, -4.48723, -7) | the camera: what it sees at a distance of 9 |
| 320 | M1, world to grid | its exact inverse | M2, inverted by a `qglbase` export |
| 384 | flow grid descriptor | a pointer, then 32 and 16 | the task points it at the grid, P+128 |
| 400, 448 | the same size as floats, then 32, 16, 31, 15 | | |
| 512, 528 | `_LifeBoundsMin` / `Max` | (-10, -10, -12) / (10, 10, 7) | not in any `.mnu`; a constant in `custom_render_plugin` |
| 560 | field centre | the origin | 2 units in front of the camera |
| 576 | field rotation | the identity matrix | the rotation vector's matrix |
| 640 | field rotation vector | zero at rest | the D-pad's turn and the shakes' |
| 656 | noise offset | zero | the wind: `wind dir` normalised, × (`wind scale` + 10 × `wind scale 10`), both 0 |
| 672 | flow strength, noise scale, `size middle`, spin rate | (1, 0.225311, 0.0536233, 2.74) | a constant 1; `brownian scale` plus two input terms, zero at rest; `size middle`; `spin time scale` |
| 688 | time step | (0.0088883, 0.0088883, 0.0088883, 1) | `delta time`, and the 1 that ages a particle once per frame |

The sources were first read off the values; the PPU code that writes them now confirms every
one - see [How the block is filled](#how-the-block-is-filled).

Reading that block settles several things:

- **The time step's w is 1**, so life advances by the aging rate once per frame. The
  particle count already implied it; now it is read from memory.
- **At rest the noise scale is `brownian scale` itself.** The two terms the PPU adds for the
  controller, one of them the `brownian` of `PARTICLES_UI.mnu` times a level, are zero then.
- **The flow strength is 1**, not something small.
- **The field turns about the origin**, and at rest its rotation vector is zero and its matrix
  the identity.
- **The flow grid is 32 x 16** over normalised coordinates, and the rectangle its matrices
  describe, 15.95 by 8.97, is exactly what the camera sees at a depth of 9 with a 53°
  field of view. That is the median depth of the captured particles: the grid is the
  screen, at the particles' own distance.

`size middle` sits next to the spin rate because the PPU puts it there with the rest, though
none of the task's steps above reads it. The grid's data, which the block seemed not to hold,
is the twelve lines the savestate leaves out - see [The flow grid](#the-flow-grid). The
strings between the fields are recycled heap, left from whatever used the memory before, in
slots the task never reads.

### What the controller does to the block

**Verified** from two more savestates, one taken while the controller was being shaken and
one while the XMB was being navigated sideways, against the one at rest:

| | gravity | friction | rotation vector, y | noise scale |
|---|---|---|---|---|
| at rest | -6.8e-05 | 0.030551 | 0 | 0.225311, `brownian scale` itself |
| shaking | -6.8e-05 | 0.030551 | 1.9e-07 | 1.493472, 6.63 times it |
| navigating | -6.8e-05 | 0.030551 | 1.843731e-05 | 0.719822, 3.19 times it |

- **Both raise the noise, and the particle object says by how much.** The PPU adds two terms
  to `brownian scale`: a level between 0 and 1 times `brownian`, and the controller's motion
  times `rshake brw` - see [How the block is filled](#how-the-block-is-filled). The block alone
  cannot split them, but the particle object keeps both, and in the same two savestates:
  - shaking, the level is 1 and the motion 0.0891, so 0.225311 + 0.6 + 0.0891 × 7.4992 =
    1.4935;
  - navigating, the level is 0.7206 and the motion 0.0083, so 0.225311 + 0.7206 × 0.6 +
    0.0083 × 7.4992 = 0.7198.
- **The field turns about y, and the slot at +640 holds a rotation vector, not a
  quaternion.** While navigating, the matrix at +576 carries ∓1.843731e-05 in its x-z
  corners, the same number the slot holds: a small-angle rotation about y, by a sixth of
  `dpad rot max`. Shaking left it a hundred times smaller, below the 1e-5 under which the
  field does not turn at all: a shake turns the field only as it starts.
- **Navigating leaves the force and the drag alone.** A first reading of this savestate
  put both at zero; that was the savestate's layout, not the block - see
  [Navigating does not clear the force and the drag](#navigating-does-not-clear-the-force-and-the-drag).

What writes these is traced in [The controller](#the-controller), and the implementation
ports it.

### The pool, and what it says about emission

**Verified.** The task's record, 32 bytes before the pointer to its parameters, leads to
the pool, and searching the savestate for -666 as a float finds its free slots directly:
they land on a 48-byte grid, as the record size says they should. Every record reads as
the disassembly describes it, down to the rotation being a unit quaternion.

- **The pool holds 2049 particles**, and 2034 of them were alive: the XMB runs it full,
  with emission waiting on a free slot. `ps3xmbwave/` uses the same size, and runs the
  same way.
- **The aging rate is `aging speed` × (1 + `aging variance` × U(-1, 1)).** The rates in
  the pool run from 0.001521 to 0.004256, against the 0.001445 and 0.004262 that symmetric
  draw gives. A one-sided draw would have started at 0.00285. A life therefore lasts
  between 235 and 692 frames, a median of 410, rather than the 285 assumed before.
- **Emission velocity, from the particles younger than 3% of a life:** speed median 0.276,
  5th to 95th percentile 0.115 to 0.348. The speed is not `emit vel min` + `emit vel var` ×
  U(0, 1), as first read, but grows as the square root of the wave's own speed - see
  [The emitter](#the-emitter).
- **Their z velocity is zero**: |vz| / |v| has a median of 0.005 at birth. `emit vel
  zscale` being 0 flattens emission into the screen plane.
- **The direction is a cone around the vertical**: |vy| / |v| has a median of 0.838,
  where a cone of `emit cone angle` 51.87° around y gives 0.809. The cone's axis is the way
  the wave moves where the particle is born, which is mostly up and down.
- **The noise builds up over a life:** |vz| / |v| climbs to 0.05, 0.20 and 0.34 at a
  tenth, a half and nine tenths of a life, and the median speed grows from 0.276 to 0.324
  while the 95th percentile goes from 0.348 to 0.633. Nothing else pushes a particle in z.

## Emission, as the captures show it

**Inferred** from the two RSX captures, before the emitter's code was found. What it does is
in [The emitter](#the-emitter); the readings below hold, except the count, which is 7.67 a
frame rather than 7.98.

- **Particles are shared evenly among the wave's vertices.** Binned by world x, the share
  of particles matches the share of wave vertices to within 1 to 2 points, in both
  captures. Capture 1:

  | World x | Wave vertices | Particles |
  |---|---|---|
  | −10 to −8 | 20.5% | 18.0% |
  | −8 to −6 | 14.7% | 14.8% |
  | −6 to −4 | 11.9% | 11.3% |
  | −4 to −2 | 11.0% | 11.4% |
  | −2 to 0 | 9.0% | 10.1% |
  | 0 to 2 | 8.1% | 9.7% |
  | 2 to 4 | 7.5% | 7.9% |
  | 4 to 6 | 7.2% | 8.0% |
  | 6 to 8 | 5.7% | 5.2% |
  | 8 to 10 | 4.4% | 3.5% |

- **The wave runs past the screen.** Its NDC x spans −2.6 to 1.7, so 29% of the
  particles are off screen. 14% of its vertices lie outside the life box, so particles
  born there die on their first update.
- **That accounts for the particle count.**
  - 16.6539 × 0.479115 = 7.98 emissions per frame (`emit per frame` × `emit prob`) - 16 ×
    0.479115 = 7.67 as the emitter counts them.
  - 86% of them land inside the box.
  - With aging rates uniform between 1 and 1 + `aging variance` times `aging speed`, a
    life lasts ln(1.493) / 0.493 / 0.00285 ≈ 285 frames on average.
  - 7.98 × 0.86 × 285 ≈ 1950, against 2028 and 2041 captured.
  - This needs life to advance by the aging rate once per frame, so the w component of
    the time step is 1.
- **Particles stay at the depth where they were born.** In every NDC x bin, the median
  particle depth is within about 0.2 of the wave's. They barely move in z, which fits
  `emit vel zscale` 0.
- **How far they stray.**
  - 75% of the on-screen particles lie inside the wave's vertical band, measured per x.
  - Outside it, the 90th percentile of the distance is 0.10 to 0.11 NDC and the 99th is
    0.38 to 0.39.

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

- **Verified from the SPU side: emission goes through a free-slot list.** The 16-byte
  state block holds the main-memory address of a list of free slots and its length. The
  task:
  - brings the list into local store;
  - appends every slot it frees during the update;
  - writes the list and the state back.
  So the PPU writes new particles straight into slots taken from that list, and never
  needs the -666 marker. No module contains -666.0f, as a float or as an integer
  immediate. The PPU side agrees: it takes the list's last slot - see
  [The emitter](#the-emitter).
- **The emitter is in `custom_render_plugin`**, beside the code that fills the block - see
  [The emitter](#the-emitter). None of the modules searched before it holds the particle
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

So what was found in `qgl_gaia_app` - the task manager, whose launcher there is reached by a
tail call from `0x48ce8`, in a class with its vtable at `0xa4190`, and the lines scene's
override names - is a copy of what the XMB runs from here. The earlier reading, that every SPU task comes from
`qgl_gaia_app`, rested on `qglbase` and `qgl_canyon_app` importing no `cellSpurs` function,
and never looked at this module.

### How the block is filled

**Verified** in `custom_render_plugin`. The particle object points at `+0x18` to a larger
object, B, laid out as the resting savestate shows it, with B at `0x200de580`: the first block
at B+0x100, its grid at B+0x180, the second block at B+0xa00, the persistent state at
B+0x1310, the field of view at B+0x1358, and the parameters at B+0x1360, with their second
copy at B+0x1490. Every frame, `0x31494` writes the first block field by field:

| Block | What `0x31494` puts there |
|---|---|
| +0, force | (0, `gravity`, 0), leaving w as it is |
| +16, drag | `friction` three times, leaving w as it is |
| +128, grid | the previous frame's cells, decayed in place by `0x2c588` - see [The flow grid](#the-flow-grid) |
| +1792, M2 | what the camera sees at a distance of 9, at z = -7: 2 × 9 × `tanf`(fov / 2) = 8.97447 high, and the camera's aspect, 16 / 9, times that wide, 15.9546 |
| +1856, M1 | M2 inverted, through a `qglbase` export |
| +2048, +2064 | the life bounds, two vector constants at `0x940b0` and `0x940c0` |
| +2096, field centre | 2 units in front of the camera, which is the origin, written by `0x2d02c` - see [The controller](#the-controller) |
| +2112, field rotation | the rotation vector's matrix, or the identity below 1e-5, written by `0x2d02c`; the task rebuilds it the same way |
| +2176, rotation vector | zero, at the start of the update, then the D-pad's turn and the shakes' - see [The controller](#the-controller) |
| +2192, noise offset | a vector the object keeps at `+0x680`, plus `wind dir` normalised × (`wind scale` + 10 × `wind scale 10`) when `wind dir` is longer than 0.0001 |
| +2208, flow strength | the object's `+0xc0`: 1, from its constructor, and written nowhere else |
| +2212, noise scale | `brownian scale` + level × `brownian` + motion × `rshake brw`, below |
| +2216 | `size middle` |
| +2220, spin rate | `spin time scale` |
| +2224, time step | (`delta time` × 3, 1) |

The noise's two input terms:

- **The level** is a damped spring the object keeps at `+0x1d8`. Each frame its velocity
  becomes 0.6 times itself, less 0.004 times its position, plus an impulse, which is then
  cleared; the position moves by the velocity; and the level, at `+0x1d4`, is the position
  clamped to [0, 1]. The D-pad and the shakes write the impulse - see
  [The controller](#the-controller).
- **The motion** comes from `0x2c758`, which the update calls while a byte at `+0x1004` is
  set, as the constructor leaves it: the length of the newest of up to 16 vectors the object
  keeps in a ring at `+0x400`, times `rshake brw`, kept at `+0x604`. The vectors are how far
  the Sixaxis's accelerometer moved from one frame to the next.

A byte at `+0xb4`, cleared by the constructor, collapses both life bounds to zero for one
frame when set, and is cleared again: a way to kill every particle at once. What sets it is not
traced.

### The task's record, and the block it reads

**Verified** from the resting savestate. The record the task walks holds the addresses its main
loop uses:

| Offset | Value | What the task does with it |
|---|---|---|
| +0 | `0x2046a900` | the pool |
| +4 to +16 | `0x20482980`, `0x800`, `0x204a1700`, `0x800` | not traced |
| +20 | `0x200df890` | GETs, and PUTs back at the end, the 16 bytes of persistent state |
| +28 | `0x200dfe00` | PUTs 128 bytes from LS `0xb100` |
| +32 | `0x200def80` | GETs the 2304-byte parameter block |
| +36 | `0x60300810` | PUTF of the completion flag |
| +40 | 1 | |
| +44 | `0x204c1800` | PUTs 1024 bytes |
| +48, +52 | `0x400`, `0x80` | 1024 and 128, the sizes of those two PUTs |

**The block the task reads is the second of two.** The first starts 2304 bytes earlier, at
`0x200de680`, and holds the same values - force, drag, rotation, time step - down to a grid
descriptor pointing at its own grid, `0x200de700`, which the second block carries too. The
savestate stores the pair 768 bytes apart, having left out their empty grids. That reads as the PPU
composing the first block and copying it whole into the second. The first half is verified now -
`0x31494` writes the first block, see [How the block is filled](#how-the-block-is-filled) - and
the copy is not found yet.

### The parameters, as the PPU holds them

**Verified** from the same savestate. 96 bytes after the second block - past the persistent state
and the camera's vertical field of view, 0.925025 - come the values of `PARTICLES.mnu` and then of
`PARTICLES_UI.mnu`, in the files' order and with the hour's blend already applied (`size middle`
0.0536168 and `glare` 0.15973 at 22:55). A second copy follows 304 bytes later. The struct is not
the files word for word:

- `emit per frame` holds the integer **16** where the file says 16.6539;
- two zero words follow `aging variance`, and the integers 6 and 4 follow `brownian scale`;
- `spot pos` and `spot attn` are padded to four words each.

**Verified** in the code as well. `0x329a4` fills the second copy from the particle menu's
values, and `0x3288c` its `PARTICLES_UI` part, 232 bytes in. That is where the integer comes
from: `emit per frame` goes through `fctiwz`, which truncates it to 16. It also shows the word
after the wind direction, at +80, holding `wind scale` + 10 × `wind scale 10`, the scale the
block's wind is built with. The emitter reads the 16 as it is - see [The emitter](#the-emitter).

**Verified: the first copy is the second plus `PARTICLES_SPE.mnu`.** Every frame the particle
object's per-frame method, `0x31f44`, copies the second copy over the first, 0x128 bytes, and
then adds to five of its fields the words at the same offsets of a third struct, at B+0x15c0,
each weighted by one of two animated factors the object keeps at `+0x140` and `+0x160`,
clamped:

- `delta time`, `glare` and `specular power` by the first factor, `delta time` clamped to
  1/300 to 1/12;
- `size middle` and `global alpha` by the second.

The five fields are exactly the five names of `PARTICLES_SPE.mnu`, whose values - one of them
-29 for `specular power` - read as offsets rather than a set, so the third struct is taken to
hold them (inferred). What drives the two factors is not traced.

### The grid's writer

**Verified.** It is in `custom_render_plugin`: `0x2f90c` writes the icon wind into the first
block's grid, once for every icon drawn, and `0x2c588` decays the grid every frame - see
[The flow grid](#the-flow-grid) for the rule. The search that missed it went through
`qgl_gaia_app`, `qglbase`, `qgl_canyon_app`, `xmb_plugin` and `vsh.elf`, every module but this
one, looking for the float-to-signed-byte sequence - `fctiwz`, a spill, a `lwz` and a `stb` -
that both functions turn out to use.

**The savestates' stacks show no PRX module at all.** `tools/re/coverage.py` places `vsh.elf`
by the return addresses the stacks keep - two thirds of the frame-shaped values that land in
its code follow a `bl`, where a wrong address gets a tenth or so. But at the load addresses
their module info records give, `0x15a0000` for `xmb_plugin` and `0x980000` for `qglbase` in
the resting savestate, neither module has a single return address in a frame-shaped slot,
though `xmb_plugin` runs all the time. So the tool sees `vsh.elf` alone, and a module missing
from its output says nothing about whether it ran.

### The emitter

**Verified** in `custom_render_plugin`. The per-frame update, `0x31494`, ends by calling
`0x30b80`, which runs the two ways particles are born and turns each birth into commands for the
pool.

**Which vertices.** The emitter draws from the wave's own vertices, the 128 lines of 128 that
`spline.elf` writes - see [The wave](#the-wave). Vertex ix of line iy sits at 32 × (128 iy + ix)
in the buffer, and a matrix the particle object keeps at `+0x50` takes it into the world
(`0x2d6e8`, `0x2d640`). Two sources pick them:

- `0x2dde4` makes one draw a frame against `emit prob`. If it passes, it picks `emit per frame`
  vertices, the integer 16, each at trunc(U × 127) on both axes; if not, none. That is 16 ×
  0.479115 = 7.67 a frame on average, in bursts.
- `0x2dbf4` sweeps. While no sweep runs, one starts with a 0.06 chance a frame, at a random
  vertex, for 100 + 80 r births. While one runs, every other frame picks the next vertex along
  its line, towards the left edge, until the births or the line run out. The frames it skips
  are the odd ones of a counter `qglbase` exports, the frame count by all appearances.

U is (r + 1) / 2, with r a draw from `qglbase`'s generator (its export `0x2e67e2d8`): a global
counter n run through the classic integer hash, x(x² 15731 + 789221) + 1376312589 on
x = n ^ (n << 13), whose low 31 bits t give 1 - t / 2^30, in (-1, 1].

**How they are born.** The vertices picked in one frame are born in the next, each the same way:

1. The vertex is fetched again, and its velocity v is how far it moved since it was picked,
   over `delta time`. A vertex that moved less than 0.0001 emits nothing.
2. The cone's axis d is that velocity's direction, reversed with a chance of `emit neg prob`.
   Across it go t1, the longest of d × X, d × Y and d × Z, normalised, and t2 = d × t1.
3. θ = U × `emit cone angle`, in degrees times 0.0174533, and φ = U × 2π give the direction
   cos θ d + sin θ (cos φ t1 + sin φ t2): uniform in angle, not over the cone's cap.
4. What lies along the camera's axis is scaled by `emit vel zscale` (`0x2b560`), and the
   direction is not renormalised.
5. The speed is max(√(|v| × `emit vel mul` × (1 + `emit vel var` × r)), `emit vel min`), a
   `powf` with 0.5 and a max.
6. The aging rate is max(0.001, `aging speed` × (1 + `aging variance` × r)), the symmetric law
   the pool shows.

**How they reach the pool.** The emitter does not write the pool. It queues 24-byte commands on
the block object, at B+0x1328, which `0x5cad0` runs through later in the frame:

- type 0 (`0x5b6bc`) takes a new slot, the free list's last - the one freed most recently - and
  zeroes its position and velocity, so life starts at 0;
- type 1 (`0x5bbf4`) sets the position's x, y and z, type 2 (`0x5bbc0`) the velocity's, and
  type 4 (`0x5934c`) the aging rate, in the velocity's w;
- type 3 (`0x59140`), which the emitter does not use, works on the velocity with a vector; what
  it does is not read.

Nothing writes the orientation: a new particle keeps the quaternion its slot's last particle
left.

This replaces the modelled emitter on every count: one draw per attempt with the fraction
carried, from random points of the surface, in a cone around its normal, at `emit vel min` +
`emit vel var` × U, flattened and renormalised, with a random orientation and no sweeps.

### The controller

**Verified** in `custom_render_plugin`, and against the particle object in the savestates.

**How the input arrives.** The XMB does not hand the scene its buttons.

- It calls the scene's event handler, `0x15330`. For every step the cursor takes, event 0/9
  carries the step's direction, which the scene passes on to the particle object (`0x1b0f4`,
  `0x2b548`): 0 left, 1 right, 2 up, 3 down.
- The pad handler, `0x16818`, takes the first connected pad's four sensors - the
  accelerometer's x, y and z, and the gyro - and passes them on as (raw − 511) / 512, clamped
  to ±1 (`0x1b0c4`, `0x2b430`). A pad whose first sensor reads zero, one without them, is
  skipped. In the savestates the controller lying still reads y at −0.2188: 112 below zero,
  which is 1 g.

**Every frame**, `0x31494` clears the rotation vector and then, before it steps the noise's
spring, runs four things in this order:

1. `0x2b2dc` puts the sensors' reading into a ring of 16 at `+0x200`, and its difference from
   the last frame's into another at `+0x400`, the ring the motion reads.
2. `0x2d02c`, the D-pad. It writes the field's centre, 2 units in front of the camera along
   its view, which is the origin. If a step came in, with direction (dx, dy), it:
   - sets the turn's axis to −dy times the camera's right axis plus dx times its up axis, with
     x then scaled by `dpad scale y` and y by `dpad scale x`. With `dpad scale y` at 0, an up
     or down step leaves the axis at zero, which stops any turn in progress;
   - adds 0.03 (`+0x190`) to the turn's spring (`+0x198`);
   - adds 0.04 (`+0x1d0`) times |dx `dpad scale x` − dy `dpad scale y`| to the noise's
     spring: a sideways step kicks the noise, an up or down one does not.

   The spring keeps 0.98 of its velocity a frame, and the field turns about the axis at
   `dpad rot max` times that velocity, clamped to [0, 1]. Last, it builds the field's matrix
   from the rotation vector, the identity if the vector is shorter than 1e-5.
3. `0x2c758` takes the newest difference's length over x, y and z, times `rshake brw`: the
   motion.
4. `0x2c3e0`, the shakes. Two detectors watch the sensors, one the accelerometer's x
   (`+0x700`) and one the gyro (`+0xb80`), each run by `0x2bcbc` and `0x2c27c`. Each frame a
   detector:
   - takes its sensor's last 16 differences, newest first, and sums them back into the
     reading relative to each earlier frame;
   - fits a least-squares line through those sums against their age, and adds up their
     distances from it: how far the last quarter of a second was from a steady drift;
   - averages that residual with the two before it, and takes the excess over
     `dshake thresh`;
   - kicks when the excess becomes non-zero, and only then, not while it stays so. The kick is
     10 times the excess, negative if the gyro reads above zero at that moment and positive
     otherwise, and doubled if it reverses the last kick within 119 frames;
   - lets the kick fade by 0.6 a frame. While it lasts, the kick times `dshake rot imp` goes
     into the detector's own spring, and its size times `dshake brw imp` into the noise's;
   - keeps 0.8 of its spring's velocity a frame, and turns the field about the camera's up
     axis at `dshake rot max` times that velocity, clamped to ±1.

   The accelerometer's detector's turn counts `dshake x coeff` times, the gyro's
   `dshake g coeff` times.

The task rebuilds the field's matrix from the final vector, shakes included (`FUN_000048b8`).

**What that means:**

- **A single step does not turn the field.** 0.03 × `dpad rot max` is 3.5e-6 radians a
  frame, under 1e-5. The spring has to pass 0.086 first, which takes four steps close
  together. A held direction does it.
- **A held direction steps every 8 frames** (inferred). The four captures taken holding one
  read the turn at 0.176, 0.179, 0.185 and 0.191 times `dpad rot max`. A step every n frames
  keeps the spring between 0.98^(n−1) × 0.03 / (1 − 0.98^n) and 0.03 / (1 − 0.98^n):
  0.1745 to 0.2011 for n = 8, 0.1535 to 0.1804 for 9, and 0.2015 to 0.2274 for 7. Only 8
  holds all four.
- **Only sideways steps kick the noise**, by 0.04 each. A tap raises the noise by at most a
  quarter, and a held direction drives the level to 1.
- **A shake turns the field only as it starts**, and the turn is gone within a second. While
  the shaking goes on, the noise carries it, through the motion and the level.

**Checked against the savestates.** The particle object is in all of them, found by the
constructor's 0.03 and 0.04, 64 bytes apart:

- Navigating: the turn's spring is at 0.1581, which times `dpad rot max` is the block's
  1.8437e-5, about +y. The last step went right.
- Both: the noise scale splits into its terms - see
  [What the controller does to the block](#what-the-controller-does-to-the-block).
- Shaking: the two detectors sit where the constructor puts them, once the line the savestate
  leaves out before them is accounted for. The residuals they keep, 0.72128 and 2.96818, are
  what the 16 differences in the ring give when recomputed. The gyro's detector reads an
  excess of 2.128, 51 frames after its last kick: the shaking had been going on for a while,
  and the kick had faded.

**Two more things the same code settles:**

- The icon wind's T, the particle object's `+0x14`, is the frame's width over its height. The
  resize method, `0x2b97c`, writes the width, the height and their ratio at `+0xc`, `+0x10`
  and `+0x14`.
- The two factors that weight `PARTICLES_SPE.mnu` are animations towards a target over a
  duration. `0x2b6a8` starts the first, called from the same event handler, `0x15330`, and
  `0x2b6dc` the second, through `0x1acb4`, from `0x1b348` and `0x1b490`. Which events those
  are is not read.

### Ruled out

- The `+0x830` and `+0x890` pairs in `qgl_gaia_app`, which match the parameter block's
  field centre and noise offset, are members of an array of 96-byte objects destroyed in a
  loop. They are not the parameter block.
- The Park–Miller generator at `0x3aa38` in `qgl_gaia_app` is a **hash**, not a sequence: it
  reads a seed through a pointer, mixes it with `0xDEADBEEF` and never writes it back. Its only
  two callers, at `0x3aab8` and `0x3b0bc`, use it to pick a random element of a linked list.
  It is not the emitter's generator.
- No code in the modules searched before `custom_render_plugin`, `vsh.elf` included, fills a
  record with scalar stores at the offsets the task reads (`+20`, `+28`, `+32`, `+36`, `+44`);
  the only match is a static constructor in `qglbase` zeroing unrelated objects.
  `custom_render_plugin` has not been searched for it yet.

## The implementation in `ps3xmbwave/`

The implementation ports what is verified as it is and models the rest, marked as modelled
in the code. The PPU side is ported as far as it is traced - how the block is filled, the flow
grid's decay and wind, the noise's formula and spring, the wind, the emitter, the controller's
response - and what it needs from the XMB is modelled: where the console's wave mesh falls on
the spline layer's wave, where the icons go when the selection moves, and the input itself.

| File | Verified | Modelled |
|---|---|---|
| `particles-reverse.js` | The update task, steps 1 to 8. The pool layout, free marker, life bounds and camera. The parameter block: its layout, the values at every offset, and how the PPU fills it, the flow grid and the noise included. The emitter and its random numbers. The controller's response: the D-pad's turn and kicks, the motion, the shake detectors. The icons' layout on screen, measured. | Where the wave's vertices fall and how fast they move; how the icons move; how often the XMB repeats a held direction; the pool's first orientations. |
| `particles.js` | Both passes, re-authored from the decompiled programs, fed with the `.mnu` values the tables above map. | `_Color` = `color_control` × (1, 1, 1) and `_Gamma` = 1. The iridescent texture comes from the fit. |
| `particles-themes.js` | The nine distinct theme sets, as their differences from the base. | Which set applies when: the day cycle above, with a four-hour smoothstep between neighbours. |
| `wave-surface-cpu.js` | | A CPU copy of the spline layer's wave vertex shader, so particles are born on the wave that is drawn. |
| `xmb-input.js` | What it hands over: steps with the XMB's four directions, and the four sensors in the PPU's units. | The rest: the mouse and keyboard stand in for the controller. |

The pool holds 2049 particles, the size read out of the savestate. Like the original it
runs full, so emission waits on a free slot; the `welcome` set, which asks for 70 births
on each frame that passes its draw, simply keeps it that way.

### Modelled choices

- **Where the wave is.** The spline layer draws in clip space with no camera.
  - A wave point goes on the camera ray through its screen position, at a depth from 7.77
    to 9.47 set by its row. That range is the one that puts new particles where the
    console's pool has them, matching the median and the width of its just-born band; it
    replaced the captured wave's own 5th to 95th percentile, 6.8 to 10.6, which was more
    than twice as thick.
  - The console's mesh reaches past the screen edges, and its 128 columns are spread 1.55
    times past them. 15.1% of births then land outside the life box and 35% off screen,
    against 14% and 28 to 30% in the captures.
- **Emission.** Ported - see [The emitter](#the-emitter) - with these modelled parts:
  - The console's 128 lines are the spline layer's rows, and its columns run across the
    surface from the right edge. A row the spline layer clips has no vertex there, and a
    birth picked on it is lost.
  - A vertex's velocity is the wave's own there, over `delta time`, rather than how far it
    moved since it was picked, since the page's frames need not match the steps.
  - **The spline layer's wave moves more slowly than the console's.** Its vertices move at
    a median 0.113 in the emitter's units, where the pool's newborns need about 0.4, so the
    emitter reads them 3.5 times faster (`WAVE_SPEED_GAIN`). That brings late life in line -
    0.081 / 0.258 / 0.491 in xy against the console's 0.081 / 0.262 / 0.517 - but leaves the
    newborns at a median 0.232 against 0.276; 4.5 brings the newborns to 0.263 and late life
    to 0.299. No one factor fits both, because the wave's speeds are distributed differently.
  - The generator starts its counter at the seed; the console's is shared by all that draw
    from it. The pool starts with random orientations, which births then pass on, and it is
    filled on the second frame, once the wave has moved.
- **Parameter block.** Ported from the PPU's code - see
  [How the block is filled](#how-the-block-is-filled): the force is `gravity` alone, the drag
  `friction`, the time step (`delta time` × 3, 1), the spin rate `spin time scale`, the flow
  strength 1, and the field turns about the origin. The wind goes in as the noise offset,
  `wind dir` normalised × (`wind scale` + 10 × `wind scale 10`), which only `gameboot3/4` and
  `welcome_1/2` turn on. The noise scale is `brownian scale` + level × `brownian` + motion ×
  `rshake brw`, with the level's spring, and what drives it and the motion, as traced - see
  [The controller](#the-controller).
- **Flow grid.** Ported: 32 × 16 cells of signed bytes, sampled the way the task samples them,
  decayed by 0.98 a frame, and written by every icon that moves - see
  [The flow grid](#the-flow-grid). At rest it stays empty, as the console's does. What is
  modelled is what writes it: the icons' motion.
- **Icons.** A modelled XMB of 10 categories with 8 items each, starting as the resting capture
  does, with four categories to the left of the selection and two items above it. Where each
  icon sits is the captures' - see [Where the icons are](#where-the-icons-are). How they get
  there is not measured:
  - on a step every icon eases towards its new place, and every category icon towards its new
    height, with a time constant of `iconEaseSec`. At its 0.065 s, the first frame of a step
    writes 58 into the category row, the captures' strongest byte there being 59.
  - Only the selected category's column is drawn, and a newly selected one appears in place.
    The console also draws the columns it is leaving, moving sideways with the row, which
    writes zero bytes wherever they pass.
  - Within a frame the grid decays first and the icons write after it; the console's order is
    not known.
  - A step to the right writes the category row as the captures show it, negative on the
    left of the selection and positive on its right, the shrinking icon's side and the
    growing one's. A step down writes the item column at +127, since items travel up to a
    third of the screen's height in a few frames.
- **Input.** The response is ported - see [The controller](#the-controller). What stands in
  for the controller is modelled, in `xmb-input.js`:
  - Steps are D-pad presses: the arrow keys, and the pointer crossing a virtual grid of 7 × 7
    icons. They reach the system one a frame, the way the XMB sends them. A key the browser
    starts repeating is held, and the system repeats it every 8 frames of its own, the rate the
    captures' turn implies. Held for ten seconds, the turn settles between 0.1745 and 0.2010
    times `dpad rot max`, where the four captures read 0.176 to 0.191.
  - Every step also moves the modelled icons, whose wind goes through the flow grid, above.
    Sideways steps raise wind as well as turning the field, as on the console: `icon wind
    scl x` being 0 means the wind has no x, not that sideways moves raise none.
  - Dragging with the mouse moves a virtual Sixaxis. The drag's acceleration reads on the
    accelerometer's x and y, through `mouseAccelToG` and 1 g = 112 of the PPU's units, and its
    sideways speed reads on the gyro, through `mouseYawGain`. z stays at zero.
  - **Which way the field turns is measured.** Four captures, two taken holding right and two
    holding left, carry the rotation at +2.09e-5 and +2.16e-5 against -2.05e-5 and -2.23e-5:
    right is positive. With the particles six and a half units beyond the centre of the turn,
    that sweeps them left - the way the icons go. It also dates the savestate taken while
    navigating: its +1.84e-5 was a step to the right.
  - Headless, holding a direction for two seconds - a step, then after 30 frames one every 8 -
    turns the field only from the fourth step on, and until 33 frames after the key is let
    go. A second after that, the drawn particles' mean has moved by -0.34 in x for right and
    +0.27 for left. A single tap does not turn the field at all. Down and up move the mean by
    +0.06 and -0.04 in y: the wind acts only where the icons move.
  - The vertical sign follows from the traced rule. `dpad scale y` is 0, so the field does not
    turn when the selection goes up or down; only the wind moves, and a cell takes the sign of
    the icon's own motion on screen, which M2 turns into a force pointing the same way. So the
    wind pushes particles the way the icons move, and since pressing down scrolls the items up
    (inferred from how the XMB scrolls), down pushes them up.
  - The same two seconds leave the noise at 3.16 times its rest as the key is let go, and 2.74
    times 0.4 s later; the savestate taken while navigating read 3.19. A tap raises it to 1.25
    times.
  - A synthetic shake of the accelerometer's x and the gyro, ±0.4 of the PPU's units at 3 Hz,
    holds the noise at 6.3 times its rest, against the shaking savestate's 6.63, and turns the
    field for 20 frames as it starts, against the gyro's reading at that moment. At ±0.05
    nothing is detected, and the motion alone raises the noise by a third.

### Against the console

`tools/bench/particles.js` runs the simulation on the spline layer's own wave and prints
this. Three 30-second runs, seeds 1 to 3. The pool's column is the resting savestate's, the
drawn column the two frame captures':

| The pool | Simulation | Console |
|---|---|---|
| Alive | 2014 to 2044 of 2049 | 2033 of 2049 |
| Aging rate, min / median / max | 0.001446 / 0.002491 / 0.004257 | 0.001447 / 0.002435 / 0.004256 |
| Just born, view depth | 7.81 / 8.81 / 9.31 | 7.57 / 8.55 / 9.07 |
| Just born, velocity z | -0.0063 / -0.0000 / 0.0080 | -0.0112 / 0.0001 / 0.0078 |
| Just born, speed in xy | 0.135 / 0.232 / 0.335 | 0.156 / 0.276 / 0.348 |
| Late in life, view depth | 7.74 / 8.53 / 9.48 | 7.41 / 8.40 / 9.32 |
| Late in life, velocity z | -0.2017 / -0.0107 / 0.2198 | -0.2501 / -0.0014 / 0.2337 |
| Late in life, speed in xy | 0.081 / 0.258 / 0.491 | 0.081 / 0.262 / 0.517 |

| What is drawn | Simulation | Capture 1 | Capture 2 |
|---|---|---|---|
| On screen | 1552 to 1572 | 1437 | 1417 |
| Opacity exactly 1 | 91.4 to 91.9% | 92% | 92% |
| View depth, median | 8.63 to 8.66 | 8.92 | 8.49 |
| Distance outside the wave band, 90th percentile (NDC) | 0.157 to 0.173 | 0.096 | 0.114 |
| Same, 99th percentile | 0.351 to 0.387 | 0.38 | 0.39 |

Known differences:

- **The spline layer's wave is flatter on screen.** Its band is 0.25 NDC tall (5th to 95th
  percentile), against 0.57 captured. Relative to the band, the particles look more spread
  out - which is also why the last two rows cannot be read cleanly: the distance is measured
  against a band that is wrong to begin with.
- **The newborns are slow**, 0.232 against 0.276 at the median, because the spline layer's
  wave moves more slowly than the console's and the emitter's speeds follow it - see
  [Modelled choices](#modelled-choices).
- **About a tenth too many on screen**, and the emitter's count was not it: the traced one,
  7.67 a frame in bursts, leaves it where it was.
- **The captured particles are denser on the left.** The captured wave runs further left
  than right, while the spline layer's wave is centred.

**The noise's drift was the emitter's count.** For as long as the emitter was modelled, the
particles moved too fast late in life - 0.369 in xy against 0.262 - and spread twice as far in
z, and the noise was the only thing that could do it: with the noise at zero the median fell to
the console's, and the z spread vanished. With the traced emitter both match, and the median
|vz| by life, which only the noise produces, matches at every age:

| Life | Simulation | Before the emitter was traced | Console |
|---|---|---|---|
| 0.00-0.05 | 0.004 | 0.004 | 0.004 |
| 0.05-0.15 | 0.012 | 0.025 | 0.011 |
| 0.15-0.30 | 0.023 | 0.049 | 0.020 |
| 0.30-0.50 | 0.045 | 0.097 | 0.049 |
| 0.50-0.70 | 0.069 | 0.146 | 0.069 |
| 0.70-0.90 | 0.089 | 0.178 | 0.095 |
| 0.90-1.01 | 0.101 | 0.206 | 0.110 |

What does it is the count. Emitting as the model did, `emit per frame` attempts a frame with
the fraction carried, takes the median |vz| at the end of a life back to 0.214; dropping the
sweeps takes it to 0.123, and a random orientation at birth leaves it at 0.101. The console
births 16 particles on about half the frames and none on the others, and on the frames without
births the deaths renumber the pool - the k-th live particle gets the k-th draw - so a particle
keeps its noise vector about half as long as it did with a birth every frame into the slot a
death had just freed.

That was the one question the analysis before it had left: how many particles renumber per
frame. On the way it had confirmed the ordering on the console - a particle's velocity
correlates with the vector its rank draws at +0.128, +0.111 and +0.193 on the three axes,
against +0.043 for a control shifted by seven - and ruled out six other causes:

- **The generator.** Re-read at `FUN_000030e8`: `il 16807`, `ilhu 0x4000`, `rotmi -9`, `or`,
  then `fs` against 3.0 - values in [-1, 1), exactly what the implementation does.
- **The scale**, which is `brownian scale` read from the block, and **the application**,
  `n = r x scale + offset` added to the force, both already verified. No `brownian scale`
  reproduced the console's shape either, which fitting it would only have hidden.
- **The reseeding period.** Against the console's own pool, one reset per frame correlates
  at +0.128 / +0.111 / +0.193, a reset every 64-particle call at +0.037 / +0.038 / +0.002
  and every 512-particle chunk at +0.094 / +0.111 / +0.154. Per frame it is.
- **The free list's discipline.** Handing slots back as a queue instead of a stack made it
  worse, not better; the PPU turns out to take the list's last slot, a stack.
- **The allocation pattern.** Neighbouring live slots differ in life by 0.339 on the console
  and 0.341 here, where unrelated lives would give 0.333, so both scatter their slots the
  same way.
- **The drag being applied without the time step.** That would damp by 3.4% a step instead
  of 0.03%, and the velocity would level off within a tenth of a life. The drift grows in a
  straight line to the end instead.

## A note on the spline document

Validating the disassembler against `spline.elf` turned up two errors in
`SPLINE_REVERSE_ENGINEER.md`: the 1/6 constant and the kernel's per-iteration stride. Both
are corrected there.

## What the pool says about emission

**Measured**, from the resting savestate's 2033 live particles, binned by how much life they
have spent. Positions as the 5th, 50th and 95th percentile:

| Life | n | x | y | z | vz |
|---|---|---|---|---|---|
| 0.00-0.01 | 17 | -9.86, -2.61, 4.70 | -1.17, -0.54, 0.66 | -7.23, -6.36, -5.56 | -0.002, 0.000, 0.001 |
| 0.03-0.08 | 121 | -9.32, -2.18, 6.79 | -2.08, -0.30, 1.02 | -7.10, -6.54, -5.61 | -0.021, -0.003, 0.019 |
| 0.20-0.50 | 590 | -9.52, -3.05, 8.42 | -1.73, -0.43, 0.82 | -7.09, -6.44, -5.58 | -0.111, -0.005, 0.097 |
| 0.50-1.01 | 1026 | -9.50, -3.12, 7.54 | -1.90, -0.47, 1.07 | -7.33, -6.40, -5.43 | -0.250, -0.001, 0.234 |

- **Particles are born on a plane and gain depth as they age.** At birth the z velocity is
  within a thousandth of zero, and by the end of a life it is spread over a quarter of a unit.
  That is `emit vel zscale`, which the `.mnu` sets to 0, read back out of the pool.
- **Birth sits in a shell at z about -6.4, give or take 0.8**, in a band of y about a unit
  wide around -0.5, spread widely in x. In view depth, which is what the emitter works in
  since the camera sits at z = 2, that is 7.57 / 8.55 / 9.07 at the 5th, 50th and 95th
  percentile. `ps3xmbwave/` used to emit between 6.8 and 10.6 deep - centred about right but
  more than twice as thick - and since `bc9be26` it emits between 7.77 and 9.47, which with
  the traced emitter puts its own band at 7.81 / 8.81 / 9.31.
- **The x and y velocities at birth run to about 0.3**, which `emit vel min` 0.15064 and
  `emit vel mul` 0.19 bracket.

**The aging law comes out exactly.** Over all 2033 particles the rate runs from 0.001447 to
0.004256, against the 0.001446 to 0.004259 that `aging speed` 0.00285223 and `aging variance`
0.493003 give as `speed x (1 +- variance)` - which is the symmetric reading this branch changed
to. The median is 0.002435, not the 0.002852 of a uniform draw, because slow particles live
longer and a snapshot over-counts them: for a 1/rate weighting the median is the geometric mean,
sqrt(0.001446 x 0.004259) = 0.002482, and that is what is there.

## Navigating does not clear the force and the drag

**Verified**, correcting an earlier reading of the savestates. The task takes the force and the
drag from the head of its transfer - `FUN_00004388` loads P+0 and clears its w, `lqd r82,16(r87)`
loads P+16 - and all 21 frame captures that hold the transfer carry (0, -6.8e-05, 0, 1) and
0.030551 there. The four taken holding right and left are among them, with the field turned by
±2.1e-5 and the noise at three times its rest.

The zeros came from the savestate's layout. Anchored on the life bounds, the force and the drag
were read 512 bytes before them, which is where they sit once the savestate has left out the
twelve empty lines of the flow grid. In the savestate taken while navigating, one of those lines
is not empty, so the file keeps it and everything after it lands 128 bytes further on: the force
and the drag are there, intact, 640 bytes before the bounds, and the read at 512 fell on the
first zeros of the grid's line. The line reads as row 11, the row the four navigation captures
show being written.

The implementation never copied the clearing, and stays as it is.

## The flow grid

The descriptor sits at the savestate's +384, the transfer's +1920, and reads, in the resting
savestate:

| Offset | Bytes | Meaning |
|---|---|---|
| +384 | `200de700 00000020 00000010 00000000` | pointer, then 32 and 16 |
| +400 | 32.0, 16.0, 0, 0 | the same size as floats |
| +416, +432 | (0, 0, 1, 0), (0, 1, 1, 1) | |
| +448 | 32, 16, 31, 15 | the size again, and the last index of each axis |

**Verified: the grid is inside the transfer, at P+128.** The update hands the sampler P+128
as the grid, and the sampler writes that address into the descriptor's pointer before it
reads anything (`FUN_00006b48`, `0x6b5c`-`0x6b70`), which is why the copies in local store read
`0xb280`: `0xb200` + 128. At three bytes a cell, 32 × 16 cells run from there to P+1664 -
exactly the twelve lines - and the captures bear that reading out.

**Measured: the grid is empty at rest, and navigating writes it.** In sixteen of the 21
captures that hold the transfer all 1536 bytes are zero, so at rest the flow adds nothing on
the console. The other five hold 70 non-zero bytes between them, and every one is the second
byte of a cell - y, read as a signed byte:

| Capture | Cells written | Values |
|---|---|---|
| holding right, twice | row 11, columns 0 to 14 | negative, growing to -23 and -33, then positive from +20 and +25 up to +53 and +59 |
| holding left, twice | row 11, columns 4 to 16 or 17 | positive, from +55 and +57 down to +27 and +24, then negative from -31 and -32 down to -2 and -3 |
| the first of the three that caught the change to music | columns 6 and 7 in rows 4 to 6 and 13 to 15, and five cells in rows 11 and 12 | -7 to +56 |

The savestate taken while navigating keeps one line of the grid, and it reads as the same row,
with -1 to -8 and then +4 to +46: a step to the right, as its rotation says.

**Verified: it is the icon wind.** `custom_render_plugin` writes the grid in two places.

- **The wind, `0x2f90c`.** The icons' drawing code (`0x122c0`) calls it for every icon it
  draws, with the icon's id and matrix, while a byte the particle object keeps at `+0x1006` is
  set, as its constructor leaves it. It projects the icon's position with the icons'
  view-projection, which `0x6fac` hands the particle object at `+0x1020`, and divides by w.
  Each icon's previous position waits in a map keyed by its id, emptied when it passes 100
  entries. If the icon has not moved on screen nothing happens; if it has, the cell under it
  is **overwritten**, not added to:
  - column ⌊(x + 1) / 2 × 32⌋ and row ⌊(y + 1) / 2 × 16⌋, each clamped to the grid;
  - bytes trunc(127 × clamp(10 × `icon wind` × (`icon wind scl x` × T × dx,
    `icon wind scl y` × dy, 0), -1, 1)), where (dx, dy) is the icon's motion on screen since
    its last call and T the frame's aspect, 16 / 9, which the object keeps at `+0x14` - see
    [The controller](#the-controller);
  - with the firmware's 11.3877, 0 and 1, that is y = trunc(127 × clamp(113.877 × dy, -1, 1)),
    with x and z left at 0.
- **The decay, `0x2c588`.** The update calls it every frame, halfway through building the
  block. Each byte becomes trunc(127 × clamp(b / 127 × 0.98, -1, 1)), in single precision,
  with the 0.98 set by the object's constructor, `0x322b8`, and written nowhere else. A 127
  goes to 124, 121, 118 and on, and reaches 0 after 84 frames, 1.4 s.

The captures agree where they can. Every non-zero byte is a y, which is what `icon wind scl x`
0 and `icon wind scl y` 1 ask for, and the cells are where the icons are - see
[Where the icons are](#where-the-icons-are). Row 11 is the category row's. Columns 6 and 7 fit a
column at x = -0.565, where one capture shows the items of an opened folder, its category moved
left to -0.786; the capture that wrote those cells, taken on entering the music category, holds
no icon draws to confirm it (inferred). So the wind is local - the grid carries it to where the
icons move - rather than a force on every particle. The values themselves need the icons'
motion over time, which a capture, a single frame, does not give.

**Verified: how the task reads a cell.** `FUN_000068e0` samples the grid bilinearly, with the
cells centred:

- the grid coordinates from M1 are multiplied by the size as floats, (32, 16), less half a
  cell: u = g × (32, 16) - 0.5, and floor(u) is the base cell, u - floor(u) the fraction
  (`FUN_00006858`);
- the four corners are the base plus the offsets at +416 and +432 - (0, 0), (1, 0), (0, 1),
  (1, 1) - each clamped on its own between (0, 0) and the last indices at +448, (31, 15)
  (`FUN_00003780`);
- a corner's three bytes sit at the pointer plus 3 × (row × 32 + column); they are
  sign-extended, converted as they are (`csflt` with no scale) and multiplied by
  `0x3c010204`, 1/127 (`FUN_00004100`, `FUN_00004060`);
- the corners are blended along the row with the fraction's x, then between rows with its y
  (`FUN_00003cb0`).

M2 then carries the sample into the world, scaling it by (15.9546, 8.97447, 1), and the flow
strength of 1 leaves it there. So a cell's y byte b adds 8.97447 × b / 127 = 0.0707 b to the
force, which at the time step of 0.0088883 is 0.000628 b on the velocity every frame. The
strongest byte captured, +59, is a force of 4.17 - 0.037 a frame, enough to take a particle
sitting in that cell from rest to the pool's median speed, 0.26, in seven frames. An x byte
would count 15.9546 / 127, but with `icon wind scl x` at 0 the writer leaves x at 0, as it
always leaves z.

Still open: how fast the icons move, which sets the values, and whether, within a frame, the
icons write before or after the update decays the grid. The scene reads each icon's place from
the XMB's own icon objects, through virtual calls, so the easing lives in the XMB rather than in
`custom_render_plugin`.

Finding one's way around a savestate's local store takes one correction. Searching for 64 bytes
of `particles.elf` at a known vaddr finds the copies of the task and gives each local store's
base in the file, and code and read-only data sit at that base plus their address; but every
all-zero line the file leaves out brings what follows 128 bytes closer. The task's own data
already sits 128 bytes early - the pointers its start-up stores at `0xb080` and `0xb180` read at
`0xb000` and `0xb100` - which is what once put the block at `0xb180` instead of the `0xb200` the
code loads it into.

### Where the icons are

**Measured** from the RSX captures. Every icon is drawn as a unit quad, -0.5 to 0.5, with its own
`_ModelviewProjection` (`lib/icons/quad.vpo`, c[256] to c[259]), so each draw's centre and size
on screen read straight off a capture. In normalised device coordinates, as the resting captures
show them:

- the category row sits at y = 0.463, row 11 of the grid. Its icons are 0.217 high and 0.2085
  apart, and the selected one sits at x = -0.411, column 9, 0.310 high, with its neighbours
  0.2185 from it;
- a category icon's centre rises by 0.1935 per unit of height it gains, to 0.481 when selected.
  The nine icons the navigation captures catch between the two sizes, from 0.225 to 0.286 high,
  all sit on that line, within 0.001;
- the selected category's items run down its column: the selected item at y = 0.065, 0.377
  high; the ones before it above the row, from 0.778 up; the ones after it below, from -0.259
  down; those 0.158 high and 0.148 apart.

While the selection moves sideways the captures also show the columns of the categories passed,
still drawn and moving with the row. How fast the icons move is not measured: a capture is a
single frame.

## Still missing

The implementation models all of these:

- How the icons move, which sets the flow grid's values. The rule that writes the cells and
  where the icons sit are ported - see [The flow grid](#the-flow-grid) - and the easing
  between places is modelled. The XMB moves them, not the scene.
- When the XMB sends a step. Every step's effect is ported - see
  [The controller](#the-controller) - and a held direction repeating every 8 frames is
  inferred from the captures; how long the XMB waits before the first repeat is not known.
- The wave the emitter reads. The spline layer's wave is not the console's: flatter, slower,
  and with the console's 128 × 128 mesh laid over it by hand - see
  [Modelled choices](#modelled-choices). That is the spline notes' open question, and it now
  sets the newborns' speeds.

Also missing:

- What copies the first block into the second, and what the pool commands' type 3 does.
- Which events start the two factors that weight `PARTICLES_SPE.mnu`'s offsets: their
  starters and the event handler that calls one of them are found - see
  [The controller](#the-controller).
- The code that generates `proc_iridescent`. The implementation uses the fit above.
- What drives `black` and `bright`, and the order and timing of the `gameboot` and
  `welcome` stages - their values are all read, and under RPCS3 neither sequence can be
  reached. `music_1` is playback and `coldboot1` is the XMB's own opening, both measured,
  and the day cycle is measured in all four of its windows.
