# The shaders

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the two passes the particles are
drawn in, what feeds them, and the camera they are drawn with.

## The Cg interfaces

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

## Uniform values at run time

RSX fragment programs embed their uniforms in the microcode, and RPCS3 caches the
microcode as it was uploaded, so its cache holds the values the XMB used.

**Verified:** `particles_quads.fpo` is cache entry `1EB87F9FA7CE69C.fp`, and
`particles_second.fpo` is `ABCA7B86F40031C0.fp`. The vertex programs are
`B9772382535D84E4.vp` and `D19B154BC25B271B.vp`.

| Uniform | Value at run time | Parameters |
|---|---|---|
| `_LightPack` column 1 | (4.16, 2.63, -7.6, 35.2904) | `spot pos x/y/z`, `specular power` |
| `_LightPack` column 2 | (1, 0, 0, 0) | `spot attn x/y/z` |
| `_LightPack` column 3 | (8, 74.74, 0.0390458, 1) | `lambert coeff`, `specular coeff`, `exposure`, `color_control` |
| `_LightPack` column 0 | (0, 0, 2, 1) | the eye position (inferred, see below) |
| `_NearControl` | (13.19, 3.79, 0.722, 0) | `size align`, `near fuzziness`, `near align` |
| `_Glare` | (0.201367, 5.44386, 0.99, 4.44) | `glare`, `glare scale`, `glare p1`, `glare p2` |
| `_IridescentExp` | 1 | `iridescent exp` |
| `_Color` | (1, 1, 1) | a fade the scene runs, not a parameter |
| `_Gamma` | 1 | a value the scene picks by a system setting |

**Verified: where `color_control`, `_Color` and `_Gamma` come from.** The particle draw
(`0x5c254`) packs `lambert coeff`, `specular coeff`, `exposure` and `color_control` into
`_LightPack`'s last column, which is the 1 at its end. `_Color` and `_Gamma` come from two values
the particle object animates, at B+0x1340 and B+0x1350, which read (1, 1, 1) and 1 in every
savestate:

- `_Color` is the scene's fade: to black when another module takes the screen, and to the
  brightness Theme Settings set - see [The particles' fade](scene-events.md#the-particles-fade).
- `_Gamma` is set at once by the scene's update (`0x14578`, through `0x1b128` and `0x2b618`,
  with a duration of zero) whenever the value it picks changes: the first word of `paf`'s
  variable `59df89eb` when the word 12 bytes into it is above 0.05, and of `paf`'s `6fd42f46`
  otherwise. The loader patches the two in from the import table, which is why they once read
  as absolute addresses; what `paf` keeps in them is not followed. The same value goes to the
  wave's renderer (`0x70bf8`). It is 1 in every savestate.

Vertex uniforms live in constant registers and are not in the cache. Their values come
from the RSX frame captures below; their meaning from the decompiled vertex shader.

## Decompiled shaders

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

## How the two passes work

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
- **Colour.** c = mix(1, `_IridescentTex`(n_view.xy × 0.5 + 0.5), `color_control`)^`iridescent
  exp`, a matcap-like lookup by the normal in view space: `color_control` takes the specular's
  colour from white (0) to the texture's (1). Both programs do it the same way.
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
| 3 | `lambert coeff`, `specular coeff`, `exposure`, `color_control` |

**Blend state, verified from the captures.** Both particle draws and the wave's draw blend
additively (`ONE / ONE`), with depth test and depth writes off. The particle draws also
enable the alpha test. `ps3xmbwave/spline.js` still draws its wave with
`SRC_ALPHA / ONE_MINUS_SRC_ALPHA`.

## The iridescent texture

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
