# PlayStation 3 XMB particles: reverse engineering notes

Work in progress, on the `particles-reeng` branch. The goal is a faithful reimplementation
of the XMB sparkles, including how they react to the Sixaxis and to icon navigation.

Everything here comes from firmware 4.93 as installed in RPCS3, analysed with the tools in
[`tools/re/`](tools/re/README.md). **Verified** means checked against the firmware files or
against what RPCS3 recorded while running the XMB; anything else is marked as inferred.
**Modelled** marks what the implementation in `ps3xmbwave/` supplies until the code is found.

## Where the particle system lives

- `dev_flash/vsh/resource/qgl/lines.qrc` holds the whole "lines" scene (wave and particles):
  SPU tasks, RSX shaders, textures and parameter files. It is a zlib-compressed tree of
  files; `tools/re/qrc.py` documents the format.
- `dev_flash/vsh/module/qglbase.sprx` (PPU, encrypted) loads it and runs the tasks on a
  SPURS instance. The RPCS3 log names it `SceQglLinesCellSpursKernel0`, with handlers
  `SceQglLinesSpursHdlr0/1`.

| File in `lines.qrc` | What it is |
|---|---|
| `spurs/particles/particles/particles.elf` | The simulation: an SPU ELF run as a SPURS task |
| `PARTICLES.mnu` | The system's 52 parameters, as plain text |
| `PARTICLES_UI.mnu` | Interaction parameters: Sixaxis shake, D-pad, icon wind |
| `PARTICLES_SPE.mnu` | 5 values, purpose unknown |
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
`size middle` 0.0218883, `global alpha` -0.555603. Negative values suggest offsets rather
than a parameter set (inferred).

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

**A capture inside the saved-data utility rules that screen out.** Its corner colours are the
base ones to the last digit and its `glare` is the cycle's, so the utility does not change the
parameter set at all: the way it dims the XMB's icons and defocuses the backdrop happens
outside `lines.qrc`. The scene carries 94 draws against the plain XMB's 77, with the same
twelve Gaussian passes in both, so the extra ones are the utility's own.

That capture did leave something, though: taken at 19:00:49, 49 seconds into the dusk-into-night
window, it reads `glare` 0.187479 where the cycle predicts 0.1874790. The window had turned over
one part in thirty thousand of its length and the value had already moved by one part in a
million, in the right direction.

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
- The particles fill the same depth slab as the wave: view z [-11.6, -4.4] against
  [-10.8, -4.5]. Projected to the screen, they cluster tightly around the wave and thin
  out with distance from it. So particles are emitted from the wave surface (inferred
  from the distribution; the emission code is still to be traced).

### Controller input

During the session, a DualSense was pad 0; it was shaken, tilted, and used on the D-pad
across icons. In that time RPCS3 compiled no new SPU code for `particles.elf` or
`spline.elf`, and no vertex constant depends on input. So input reaches the particles as
data, in one of two ways:

- the task receives raw sensor values and handles them in code it always runs (SPU code
  is largely branch-free);
- or the PPU (`qglbase.sprx`) turns them into impulses first.

The task's parameter block will tell which.

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
parameter block. That is most likely the PPU, `qgl_gaia_app.prx`.

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
   - R is the matrix at P+2112, rebuilt every frame from the quaternion at P+2176
     (`FUN_000048b8`).
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
in main memory, at `0x200de600` and 768 bytes later, and twice inside the local store of
an SPU thread, where the task keeps it at `0xab80`.

**The structure is 768 bytes, and the task DMAs three of them.** That is what the two
bases in the disassembly meant: the force and the drag are at `+0` and `+16` of the third
structure, which sits 1536 bytes after the start of the transfer, and every other offset
traced earlier is that same structure's.

| Offset | Field | In the savestate | Source |
|---|---|---|---|
| 0 | constant force | (0, -6.8e-05, 0, 1) | `gravity`; the wind is off, `wind scale` being 0 |
| 16 | drag | (0.030551, 0.030551, 0.030551, 0) | `friction` |
| 256 | M2, grid vector to world | diag(15.9546, 8.97447, 1), translation (-7.9773, -4.48723, -7) | |
| 320 | M1, world to grid | its exact inverse | |
| 384 | flow grid descriptor | pointer to the matrices at 256, then 32 and 16 | |
| 400, 448 | the same size as floats, then 32, 16, 31, 15 | | |
| 512, 528 | `_LifeBoundsMin` / `Max` | (-10, -10, -12) / (10, 10, 7) | not in any `.mnu` |
| 560 | field centre | the origin | |
| 576 | field rotation | the identity matrix | |
| 640 | field quaternion | zero at rest | |
| 656 | noise offset | zero | |
| 672 | flow strength, noise scale, ?, spin rate | (1, 0.225311, 0.0536233, 2.74) | `brownian scale` unchanged, then `size middle`, then `spin time scale` |
| 688 | time step | (0.0088883, 0.0088883, 0.0088883, 1) | `delta time`, and the 1 that ages a particle once per frame |

Reading that block settles several things:

- **The time step's w is 1**, so life advances by the aging rate once per frame. The
  particle count already implied it; now it is read from memory.
- **The noise scale is `brownian scale` itself**, not scaled by the `brownian` of
  `PARTICLES_UI.mnu`.
- **The flow strength is 1**, not something small.
- **The field turns about the origin**, and at rest its quaternion is zero and its matrix
  the identity.
- **The flow grid is 32 x 16** over normalised coordinates, and the rectangle its matrices
  describe, 15.95 by 8.97, is exactly what the camera sees at a depth of 9 with a 53°
  field of view. That is the median depth of the captured particles: the grid is the
  screen, at the particles' own distance.

Two things the block does not answer: where the grid's data lives, since the descriptor
points at the matrices rather than at an array, and why `size middle` sits next to the
spin rate. The head of the 2304-byte transfer is recycled heap, still holding strings from
whatever used the memory before, so the task reads nothing there.

### What the controller does to the block

**Verified** from two more savestates, one taken while the controller was being shaken and
one while the XMB was being navigated sideways, against the one at rest:

| | gravity | friction | rotation vector, y | noise scale |
|---|---|---|---|---|
| at rest | -6.8e-05 | 0.030551 | 0 | 0.225311, `brownian scale` itself |
| shaking | -6.8e-05 | 0.030551 | 1.9e-07 | 1.493472, 6.63 times it |
| navigating | 0 | 0 | 1.843731e-05 | 0.719822, 3.19 times it |

- **Both raise the noise, and `rshake brw` alone accounts for it.** At
  `brownian scale` × (1 + `rshake brw` × level) the two states put the level at 0.75 and
  0.29. Bringing the `brownian` of `PARTICLES_UI.mnu` into that product would need a level
  above 1 while shaking, so it is not in there.
- **The field turns about y, and the slot at +640 holds a rotation vector, not a
  quaternion.** While navigating, the matrix at +576 carries ∓1.843731e-05 in its x-z
  corners, the same number the slot holds: a small-angle rotation about y, by a sixth of
  `dpad rot max`. Shaking left it a hundred times smaller, so a shake is mostly noise.
- **Navigating showed the force and the drag at zero**, which one sample cannot explain.
  `ps3xmbwave/` does not copy that.

The implementation now follows the two measured numbers: an icon step raises the level to
`brownian` and turns the field about y, and 0.4 s later it reaches 3.17 times the base
noise against the 3.19 measured.

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
  5th to 95th percentile 0.115 to 0.348, against the 0.1506 to 0.433 that
  `emit vel min` + `emit vel var` × U(0, 1) gives, median 0.29.
- **Their z velocity is zero**: |vz| / |v| has a median of 0.005 at birth. `emit vel
  zscale` being 0 flattens emission into the screen plane.
- **The direction is the cone around the vertical**: |vy| / |v| has a median of 0.838,
  where a cone of `emit cone angle` 51.87° around y gives 0.809.
- **The noise builds up over a life:** |vz| / |v| climbs to 0.05, 0.20 and 0.34 at a
  tenth, a half and nine tenths of a life, and the median speed grows from 0.276 to 0.324
  while the 95th percentile goes from 0.348 to 0.633. Nothing else pushes a particle in z.

## Emission, as the captures show it

**Inferred** from the two RSX captures. The emitter's code is still to be found.

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
  - 16.6539 × 0.479115 = 7.98 emissions per frame (`emit per frame` × `emit prob`).
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
| `qglbase.prx` | The QGL engine: resource banks, the `.mnu` parser, a small script language (`$FRAME_COUNT`, `goto`, `repeat … until`), the debug GUI, RSX setup through the VSH's `sdk` library. |
| `qgl_gaia_app.prx` | The Earth scene, plus a generic per-scene SPURS task manager: prefix `"SceQgl"` + scene name, tasksets, tasks, event flags (28 named `cellSpurs` imports). |
| `qgl_canyon_app.prx` | The canyon theme. |

Findings so far:

- **Verified from the SPU side: emission goes through a free-slot list.** The 16-byte
  state block holds the main-memory address of a list of free slots and its length. The
  task:
  - brings the list into local store;
  - appends every slot it frees during the update;
  - writes the list and the state back.
  So the PPU writes new particles straight into slots taken from that list, and never
  needs the -666 marker. No module contains -666.0f, as a float or as an integer
  immediate.
- **The emitter itself has not been located yet.** No module contains particle parameter
  names, which fits parameters being read by position. The scene code is reached through
  C++ virtual calls.
- The lines scene seems split between modules (inferred from the RPCS3 log). Right before
  the `SceQglLines` SPURS instance is created, `qglbase` allocates memory and the RSX I/O
  mappings of the wave (`io 0x500000`) and particle (`io 0x600000`) buffers are set up.

### Every SPU task comes from `qgl_gaia_app`

**Verified.** `qglbase.prx` and `qgl_canyon_app.prx` import no `cellSpurs` function at
all, so the task manager in `qgl_gaia_app` runs the tasks of every scene, the lines one
included. It holds a single `cellSpursCreateTask` call, at `0x468a4`, inside the function
at `0x46590`, and passes the task an argument whose second word is `object + 0x200`: the
address of the list of 56-byte records the task walks. The same object holds event flags
at `+0x80` and `+0x100`, a three-word descriptor at `+0x180`, the local-store pattern at
`+0x318` (from a table at `0xa32c8`) and the pointer to the SPU ELF at `+0x328`.

`0x46590` has no callers: it is reached by a tail call from `0x48ce8`, whose class has its
vtable at `0xa4190` (virtuals at `0x44ae0`, `0x450c4`, `0x44f74`, `0x4520c`, `0x45ac0`,
`0x46558`, `0x46c08`, `0x49594` and others, through the OPDs at `0xa5ef4`-`0xa5f8c`). The
vtable is installed from `0x44f80`, `0x44f90`, `0x450d0`, `0x450e0`, `0x4548c` and
`0x45498`. **The next step is to read that constructor**: the record list, and with it the
parameter block each record points at, belongs to this class.

### Ruled out

- The `+0x830` and `+0x890` pairs in `qgl_gaia_app`, which match the parameter block's
  field centre and noise offset, are members of an array of 96-byte objects destroyed in a
  loop. They are not the parameter block.
- The Park–Miller generator at `0x3aa38` is a **hash**, not a sequence: it reads a seed
  through a pointer, mixes it with `0xDEADBEEF` and never writes it back. Its only two
  callers, at `0x3aab8` and `0x3b0bc`, use it to pick a random element of a linked list.
  It is not the emitter's generator.
- `_LifeBounds`, (-10, -10, -12) and (10, 10, 7), appears as a float triple in no module
  and in no file of the scene, so it is built at run time.
- No code in any of the modules or in `vsh.elf` fills a record with scalar stores at the
  offsets the task reads (`+20`, `+28`, `+32`, `+36`, `+44`); the only match is a static
  constructor in `qglbase` zeroing unrelated objects. The records must be written with
  vector stores, or copied from a template.

## The implementation in `ps3xmbwave/`

The PPU side is not traced yet, so the implementation ports what is verified as it is.
It models the rest, marked as modelled in the code, until the PPU code replaces it.

| File | Verified | Modelled |
|---|---|---|
| `particles-reverse.js` | The update task, steps 1 to 8. The pool layout, free marker, life bounds and camera. The parameter block: its layout, and the values at every offset. | What the flow grid holds, the emitter, and the response to input. |
| `particles.js` | Both passes, re-authored from the decompiled programs, fed with the `.mnu` values the tables above map. | `_Color` = `color_control` × (1, 1, 1) and `_Gamma` = 1. The iridescent texture comes from the fit. |
| `particles-themes.js` | The nine distinct theme sets, as their differences from the base. | Which set applies when: the day cycle above, with a four-hour smoothstep between neighbours. |
| `wave-surface-cpu.js` | | A CPU copy of the spline layer's wave vertex shader, so particles are born on the wave that is drawn. |
| `xmb-input.js` | | All of it: the mouse and keyboard stand in for the controller. |

The pool holds 2049 particles, the size read out of the savestate. Like the original it
runs full, so emission waits on a free slot; the `welcome` set, which asks for 70.6
emissions a frame, simply keeps it that way.

### Modelled choices

- **Where the wave is.** The spline layer draws in clip space with no camera.
  - A wave point goes on the camera ray through its screen position, at a depth from 6.8
    to 10.6 set by its row. That is the 5th to 95th percentile of the captured wave's
    depth on screen.
  - Emission reaches 1.55 times past the screen edges. 14.7% of emissions then land
    outside the life box and 25% off screen, against 14% and 28 to 30% in the captures.
- **Emission.** Each frame makes `emit per frame` attempts, carrying the fraction over.
  Each attempt is kept with probability `emit prob`, at a random point of the wave.
  - Velocity: `emit vel mul` times the wave's own velocity there. On top of that, a
    random direction in a cone of `emit cone angle` around the surface normal, flipped
    with probability `emit neg prob`, at `emit vel min` + `emit vel var` × U(0, 1). Its z
    is scaled by `emit vel zscale`.
  - Aging rate: `aging speed` × (1 + `aging variance` × U(-1, 1)), as the pool shows.
  - Orientation: uniformly random.
  - The random numbers come from a Park–Miller generator, the arithmetic qgl_gaia_app
    carries, though it uses it as a hash rather than a sequence.
- **Parameter block.** Everything the savestate shows is used as it is: the force is
  `gravity` alone, the drag `friction`, the time step (`delta time` × 3, 1), the spin rate
  `spin time scale`, the noise scale `brownian scale`, the flow strength 1, and the field
  turns about the origin. What the implementation adds on top is the icon wind, in the
  force, and the agitation level, which multiplies the noise scale by
  (1 + `rshake brw` × level).
- **Flow grid.** Its 32 × 16 size and its two matrices are the firmware's; what the nodes
  hold is not, since the block only points at the matrices.
  - Each node takes the wave's nearby velocity, with Gaussian weights of radius 1.5, so
    the flow fades where the wave is far, and is divided by the grid's own scale so that
    M2 hands the task back a world velocity.
  - `flowGridGain` scales that velocity on its way in. It is the modelled half of the
    flow: the flow strength beside it is the firmware's 1.
- **Input.**
  - Icon steps are D-pad presses. A horizontal one yaws the field about its centre, at up
    to `dpad rot max` per frame, scaled by `dpad scale x`. A vertical one pitches it,
    scaled by `dpad scale y` (0). The rate decays by 0.85 per frame.
  - The icons' scroll velocity pushes particles along y, as `icon wind` × `icon wind scl y`.
  - The accelerometer is tested as hypot(`dshake x coeff` × a_x, `dshake g coeff` × a_y)
    against `dshake thresh`. Above it, two things happen:
    - the field is stirred about y, the axis the savestates show, at up to
      `dshake rot max` per frame, in the direction of the swing that started the shake;
    - the shake level rises by `dshake brw imp`.
  - The level, whichever input raised it, scales the noise as
    `brownian scale` × (1 + `rshake brw` × level), which is what the savestates measure.

### Against the captures

From three 30-second runs of the simulation on the spline layer's wave, headless:

| | Simulation | Capture 1 | Capture 2 |
|---|---|---|---|
| Particles alive | 1881 to 1933 | 2028 | 2041 |
| On screen | 1439 to 1493 | 1437 | 1417 |
| Opacity exactly 1 | 91.6 to 92.2% | 92% | 92% |
| View depth, median | 8.72 to 8.82 | 8.92 | 8.49 |
| Distance outside the wave band, 90th percentile (NDC) | 0.077 to 0.085 | 0.096 | 0.114 |
| Same, 99th percentile | 0.17 to 0.20 | 0.38 | 0.39 |

Known differences:

- **The spline layer's wave is flatter on screen.** Its band is 0.25 NDC tall (5th to 95th
  percentile), against 0.57 captured. Relative to the band, the particles look more spread
  out.
- **Fewer particles stray far from the wave.** The 99th percentile is about half the
  captured one. The extra speed in the original may come from a faster wave, since the
  wave's velocity feeds emission, or from a longer tail in the emission speeds.
- **The captured particles are denser on the left.** The captured wave runs further left
  than right, while the spline layer's wave is centred.

## A note on the spline document

Validating the disassembler against `spline.elf` turned up two errors in
`SPLINE_REVERSE_ENGINEER.md`: the 1/6 constant and the kernel's per-iteration stride. Both
are corrected there.

## Still missing

The implementation models the first three:

- Emission: where new particles are written into free slots, with which position,
  velocity, aging rate and rotation (on the PPU side, most likely).
- What the flow grid holds, and the code that fills the parameter block each frame. The
  block's layout and its values are read from memory, at rest and under both kinds of
  input, but the grid's own data is not in it.
- Why navigating showed the force and the drag at zero.

Also missing:

- The code that generates `proc_iridescent`. The implementation uses the fit above.
- What drives the theme sets outside the day cycle (`black`, `music_1`, `coldboot`,
  `gameboot`, `welcome`), beyond the one negative above. The day cycle itself is now
  measured in all four of its windows.
- What `PARTICLES_SPE.mnu` is for.
