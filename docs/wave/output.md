# What the console draws

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): the wave as `spline.elf` hands it to the
RSX, read out of RPCS3's frame captures and savestates with `tools/bench/wave-frames.py`. It is
what the implementation is measured against - see [The spline layer against the
console](implementation.md#against-the-console).

## The buffers

**Verified** from 23 RSX captures and 9 savestates.

- `lib/moyou/lines1.vpo` draws the wave in one indexed draw of 16384 vertices, the frame's fifth
  (draw 4) in every capture.
- The vertices sit in main memory, in one of two 512 KB buffers at io `0x500000` and `0x580000`,
  and the frames alternate between them: 14 captures draw the first, 9 the second.
- A savestate holds both, one after the other. They differ everywhere by a small, smooth step, a
  median of 0.003 in camera space, so they are consecutive frames (inferred: which one is newer is
  not known). That step is the wave's speed.
- A vertex is 32 bytes: its position, then a second vector, four floats each.

## The mesh

**Verified.**

- 128 lines of 128 vertices, one line after the other, so vertex ix of line iy is record
  128 iy + ix. Along a line, column 0 is the right end.
- The index buffer (local memory, 32-bit, the same in every capture) draws triangle strips between
  neighbouring lines, 17 columns at a time with a primitive restart between strips: 8 strips for
  each of the 127 pairs of lines.
- The position is in clip space, already projected by the camera the particles use - see
  [Camera](../particles/shaders.md#camera). w is the view depth, and z = 1.0002 w - 0.20002 for
  every vertex. `lines1.vpo` passes it through untouched and has no matrix, so where the wave sits
  and how it turns are in the vertices.
- The second vector is the surface's normal in clip space, not normalised. It is the cross product
  of the step across the lines with the step along them: against finite differences of the
  positions its direction agrees to |cos| = 1.0000 at every interior vertex.
- The texture coordinates sit in local memory and are the same in every capture. u is the line's
  index over 127. v fades the mesh out towards its edges: v = f(ix) f(iy), with
  f(i) = min(1, 10 min(i, 127 - i) / 127).
- The wave blends additively, with no depth test - see
  [How the two passes work](../particles/shaders.md#how-the-two-passes-work).

## A bicubic B-spline patch

**Inferred** from the mesh. This is a lead for the kernel.

- In both directions the vertices come in blocks of eight. Within a block they are evenly spaced,
  and the step from the last vertex of a block to the first of the next is 0.937 times the others
  (median over the lines of a capture).
- A uniform B-spline sampled eight times per span, at t = j × 16/127 for j = 0 to 7, gives exactly
  that when each block starts its span afresh. The step across a block's end is then
  1 - 7 × 16/127 = 0.118 of a span, against 16/127 = 0.126 within it: 0.9375.
- The normal agrees. Its length is (127/16)² = 63.0 times the cross product of the steps per vertex
  (median 63.006), which makes it the cross product of the derivatives per span.
- 16 spans of a cubic B-spline need 19 control points. Upstream's reading of `spline.elf` found a
  table, `DAT_00009c00`, of 361 = 19 × 19 entries - see [Main table and
  normalization](../../SPLINE_REVERSE_ENGINEER.md#main-table-and-normalization) - indexed
  19 × row + column ([Index math](../../SPLINE_REVERSE_ENGINEER.md#index-math-inside-fun_000045c0)),
  and the cubic basis [0, 1/6, 2/3, 1/6] in `.rodata`
  ([What r37 seems to be](../../SPLINE_REVERSE_ENGINEER.md#what-r37-seems-to-be)). So the wave
  would be a bicubic patch over 19 × 19 control points, evaluated 8 × 8 times per span.
- The kernel's stores fit, four lanes at a time. Each of its 8 iterations writes four vertices 256
  bytes apart, which is 8 records: the same t in four neighbouring spans - see [The spline
  kernel](../../SPLINE_REVERSE_ENGINEER.md#the-spline-kernel-the-good-stuff).
- A projection is linear in homogeneous coordinates. Evaluating the patch on control points already
  in clip space therefore gives these vertices and this normal.

## The draw's uniforms

**Verified** from the captures and from RPCS3's decompilation of the program, the one vertex program
in its shader log that reads attributes 0, 8 and 9.

| Uniform | Register | Parameter |
|---|---|---|
| internal constant 2 | c[464] | none |
| `_MipmapBias` | c[465] | `LINE1.mnu: MIPMAP BIAS` |
| `_Brightness` | c[466] | `LINE1.mnu: BRIGHTNESS` |
| `_Fresnel` | c[467] | `LINE1.mnu: FRESNEL` |

The three values move with the parameter sets, by the same factor as the particles' - see [Themes
blend over hours](../particles/day-cycle.md#themes-blend-over-hours).

The program passes the position and u through. Let e be the position normalised and n the normal
normalised. The program works out:

- m = |e · normal| / |position| × `_MipmapBias`, with the normal as it comes, so m grows with the
  cell's size;
- TEXCOORD0 = (u, m), and TEXCOORD1 = (`_Fresnel` m, `_Brightness` m, |e · n| m, v);
- e reflected about n (using c[464]), written to an output the fragment program does not read.

What the fragment program makes of them, with its `_Stripes` and `_FresLUT` textures and the
embedded `_Spacing` and `_Thinness`, is for the shading pass.
