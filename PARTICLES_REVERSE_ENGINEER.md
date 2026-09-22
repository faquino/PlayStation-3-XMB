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

**Verified: overrides apply at run time.** The glare value the XMB fed `particles_second`
was 0.201367, an override value rather than the base 0.159705.

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
line would instead take about three hours, from 19:34 to 22:30. `ps3xmbwave/` uses the
smoothstep, and models the rest of the day the same way: this is the only transition the
captures caught.

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

Likely `.mnu` sources for P (inferred from names and use, to be confirmed on the PPU side):

| P offset | Use | Likely parameter |
|---|---|---|
| P[0].xyz | constant force | `gravity` and/or `wind` |
| P[16] | drag | `friction` |
| P[2192], P[2212] | noise offset and scale | `wind dir`, `brownian scale` |
| P[2208] | flow strength | |
| P[2220] | spin rate | `spin time scale` |
| P[2224] | time step | `delta time` |

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
| `particles-reverse.js` | The update task, steps 1 to 8. The pool layout, free marker, life bounds and camera. | The parameter block (which `.mnu` value goes where), the emitter, the flow grid's content, and the response to input. |
| `particles.js` | Both passes, re-authored from the decompiled programs, fed with the `.mnu` values the tables above map. | `_Color` = `color_control` × (1, 1, 1) and `_Gamma` = 1. The iridescent texture comes from the fit. |
| `particles-themes.js` | The nine distinct theme sets, as their differences from the base. | Which set applies when: the day cycle above, with a four-hour smoothstep between neighbours. |
| `wave-surface-cpu.js` | | A CPU copy of the spline layer's wave vertex shader, so particles are born on the wave that is drawn. |
| `xmb-input.js` | | All of it: the mouse and keyboard stand in for the controller. |

The pool holds 4096 particles, which is enough for every set but `welcome`: its 70.6
emissions per frame and lives three times longer would need some 24000 slots, so it fills
the pool and emission waits for a slot. The original's pool size is unknown.

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
  - Aging rate: `aging speed` × (1 + `aging variance` × U(0, 1)).
  - Orientation: uniformly random.
  - The random numbers come from a Park–Miller generator, the arithmetic qgl_gaia_app
    carries, though it uses it as a hash rather than a sequence.
- **Parameter block.**
  - Force: `gravity`, plus `wind dir` × (`wind scale` + 10 × `wind scale 10`), plus the
    icon wind.
  - Drag: `friction`. Time step: (`delta time` × 3, 1). Spin rate: `spin time scale`.
  - Noise scale: `brownian scale` × (1 + `brownian` × `rshake brw` × shake level).
- **Flow grid.** The grid lies in the screen-parallel plane, with x over the life box and
  y from −5 to 7.
  - Each node holds the wave's nearby velocity, with Gaussian weights of radius 1.5, and
    fades where the wave is far.
  - The flow strength defaults to `friction`, so the wave drags nearby particles at the
    rate friction slows them.
- **Input.**
  - Icon steps are D-pad presses. A horizontal one yaws the field about its centre, at up
    to `dpad rot max` per frame, scaled by `dpad scale x`. A vertical one pitches it,
    scaled by `dpad scale y` (0). The rate decays by 0.85 per frame.
  - The icons' scroll velocity pushes particles along y, as `icon wind` × `icon wind scl y`.
  - The accelerometer is tested as hypot(`dshake x coeff` × a_x, `dshake g coeff` × a_y)
    against `dshake thresh`. Above it, two things happen:
    - the field is stirred around the view axis, at up to `dshake rot max` per frame, in
      the direction of the swing that started the shake;
    - the shake level rises by `dshake brw imp`.

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
- How the parameter block is filled each frame: the flow grid, the field rotation
  quaternion, and which `.mnu` values go where.
- How controller input changes that block.

Also missing:

- The code that generates `proc_iridescent`. The implementation uses the fit above.
- Which theme set applies at each hour, and what drives the ones outside the day cycle
  (`black`, `music_1`, `coldboot`, `gameboot`, `welcome`). Only the dusk-to-night
  transition was captured; `ps3xmbwave/` models the rest.
- What `PARTICLES_SPE.mnu` is for.
