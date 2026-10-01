# The SPU task: `spline.elf`, step by step

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): what `spline.elf` does with its inputs
every frame. What those inputs are, and where they come from, is in [The inputs](inputs.md).

**Verified** from the savestates. Each one holds `spline.elf`'s local store as the task left it
after a frame, and evaluating that local store's grid as below reproduces one of the frame's two
wave buffers to 3e-5, which is float rounding, in all nine. Addresses are local store ones, and
the functions are named as in upstream's reading,
[`SPLINE_REVERSE_ENGINEER.md`](../../SPLINE_REVERSE_ENGINEER.md).

## The steps

`FUN_000053e0` runs them in this order:

1. **Three DMAs in**, from addresses in the job's first two quadwords: the grid, 361 points of 16
   bytes, to `0x9c00` (`FUN_00003610`, 5776 bytes); a matrix to `0xb300` (`FUN_000035c8`, 64
   bytes, upstream's `b300`); the deformation lattice to `0xb380` (`FUN_00003580`, `0x2200` bytes,
   upstream's `b380`). The job's next three quadwords go to `0xd590`, `0xd5a0` and `0xd5b0`.
2. **Each grid point is deformed in place** (`LAB_00005498`, through `FUN_00003c68`): a
   free-form deformation by a tricubic B-spline - see [The deformation](#the-deformation).
3. **Each grid point is transformed in place** by the matrix (`LAB_000054bc`, through
   `FUN_00003bf0`): the four helpers upstream found each scale one of the matrix's columns by one
   of the point's components, and the sum is the product. After this the grid is in clip space.
4. **The grid is evaluated as a surface** and written out as the wave buffer (`FUN_000045c0`, called
   from `LAB_00005564`) - see [The surface](#the-surface).

## The deformation

`FUN_00003c68` takes a point p and the three quadwords at `0xd590` to `0xd5b0`, which are
`LINE1.mnu`'s `FFD SCALE1`, `FFD SCALE2` and `FFD OFFSET` - see [What the job
carries](inputs.md#what-the-job-carries):

- u = (p - `FFD OFFSET`) / `FFD SCALE1`, and q = clamp(u, 0, 0.999) × (8, 4, 4);
- the integer part of q picks a cell of the lattice, and its fraction f gives each axis the cubic
  B-spline's weights, the basis matrix at `0xd5c0` times (f³, f², f, 1);
- the lattice holds 11 × 7 × 7 points, the one at (i, j, k) at `0xb380` + 16 (i + 11 (j + 7 k));
  the 64 around the cell are summed with the weights;
- the result is (u + that sum) × `FFD SCALE2`.

So the lattice holds displacements, added to the point's own normalised position, and the scale
comes last. The `0.999` (`0x3f7fbe76`) keeps the cell index inside the lattice.

## The surface

The grid is 19 × 19 control points, point (row, column) at `0x9c00` + 16 (19 row + column), and
the wave is the uniform bicubic B-spline surface over them: 16 × 16 spans. Each span is sampled 8
times in each direction, so

- vertex ix of line iy lies in span (iy / 8, ix / 8), integer division, at
  t = (iy mod 8) × 16/127 and s = (ix mod 8) × 16/127;
- its position is the sum of the 4 × 4 control points around the span, weighted by the cubic
  B-spline's basis at t (along rows) and at s (along columns);
- its normal is the cross product of the derivative in t with the derivative in s, both per span,
  in clip space's x, y and z, unnormalised, with w = 0.

So the lines of the wave are the grid's rows, and the columns run along each line. A span's eight
samples stop at 7 × 16/127 = 0.882, so each block of eight starts its span afresh. That is the
0.937 step [the mesh](output.md#the-mesh) shows at every eighth vertex, and the (127/16)² the
normal's length shows.

The stores upstream found fit this, though how the kernel walks the mesh is not followed: each of
its 8 iterations writes four vertices 256 bytes, that is 8 vertices, apart. That would be the same
s in four neighbouring spans, four lanes at a time (inferred).

## The constant tables

`FUN_00005fd8` fills the B-spline's tables at start-up:

- `0xd5c0`: the cubic B-spline's basis matrix, rows (-1/6, 1/2, -1/2, 1/6), (1/2, -1, 1/2, 0),
  (-1/2, 0, 1/2, 0) and (1/6, 2/3, 1/6, 0), which the deformation uses;
- `0xd600`: the four basis functions at t = k/128 for k = 0 to 127;
- `0xde00`: their derivatives at the same t.

The surface's samples, at t = j × 16/127, are not on that table's steps, and evaluating the surface
from it misses the buffers by 0.01. What the two tables are for is not followed.
