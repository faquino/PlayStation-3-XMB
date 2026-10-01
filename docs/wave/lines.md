# The lines: the PPU's simulation

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): how `custom_render_plugin` moves the 19
lines whose points become [the task's grid](inputs.md#the-grid). The object and its code are read
in the module; the savestate of 22 September at 22:55 holds the object, which puts it at
`0x20401b90`, and checks every formula marked verified below.

## The object

The lines object, built at `0x4f600`, keeps the lines as seven arrays of 19 × 19 points, each
behind a descriptor of 0x30 bytes - a count, 361, then a pointer:

| Offset | Holds |
|---|---|
| +0x00 | another object, whose +0xac holds `FFD PARAM 1`'s value - see [What the task receives](#what-the-task-receives) |
| +0x2c, +0x30 | 19 and 19, the points per line and the lines |
| +0x40 | A0, the grid the task receives |
| +0xa0 | A2, the points as they were before the last step |
| +0xd0 | A3, the points |
| +0x160 | A6, their velocities |
| +0x1e0 | 35306 and 16384, the mesh's index and vertex counts |
| +0x1f0, +0x230 | the model matrix, and the matrix the task receives - see [The matrix](inputs.md#the-matrix) |
| +0x274 to +0x2a8 | `LINE1.mnu`'s values: `DAMPING` +0x274, `LENGTH` +0x278, `TENSION` +0x27c, `TIMESTEP` +0x294, `PERTURBATION` +0x298, `END X`, `END Y` and `END Z` +0x2a0 to +0x2a8 |
| +0x2c0 | the clock, and at +0x2c4 the clock smoothed |
| +0x2cc | the steps' accumulator, and at +0x2d0 the frame's time × 60 |
| +0x2d4 | the noise's counter |

The arrays at +0x70, +0x100 and +0x130 are not used by anything below.

## Each frame

**Verified.** `0x4f814` takes the frame's time in seconds:

- the accumulator gains the time × 60, and while it is above 1 a step runs and 1 comes off it, so
  the lines step 60 times a second whatever the frame rate;
- every point of A0 is then A2's interpolated towards A3's by what is left in the accumulator, with
  y and z scaled by s(x), x being the interpolated point's x - see
  [What the task receives](#what-the-task-receives).

## A step

`0x4bed0`, in this order. Every point has unit mass; v is its velocity in A6, p its place in A3.

1. A2 takes a copy of A3.
2. **The clock** gains `TIMESTEP` × 0.0001. Past 10 it is set back to 0 (`0x4b6a4`), which also
   calls `0x47af0` on the object at +0x00 (not followed).
3. **Springs.** Each point i is tied to the points one and two before it along its line, and to
   the points one and two lines before it in its column. For each such point j, with
   d = p_j - p_i, the force f = d / |d| × (|d| - L) × k goes into v_i, and out of v_j. One apart, L
   is `LENGTH` and k `TENSION`; two apart, L is twice `LENGTH` and k ten times `TENSION`. The
   springs across the lines make the 19 lines one sheet, stretched and bent like cloth.
4. **Noise.** Each point's v then gains `PERTURBATION` × (h(n + 1), h(n + 2), h(n + 3), 0), the
   counter n moving on by 3, where h(n) = 1 - (y & 0x7fffffff) / 2^30 with x = (n << 13) ^ n and
   y = x (x² 15731 + 789221) + 1376312589 (`0x4ab04`), in 32-bit integers.
5. **Integration**, verified: p gains v × `TIMESTEP` × 0.0001, then v loses v × `DAMPING` ×
   `TIMESTEP`.
6. **The ends** (`0x4bce4`), verified. The smoothed clock t moves a tenth of the way to the clock.
   Then on each line r, from 0 to 18:
   - the first point's v gains (`TIMESTEP` × 0.02, 0, 0), a pull outwards;
   - the last point, column 18, is set to (0, `END Y` × (0.5 sin(11 (r / 19 + t)) + 0.5),
     `END Z` × 0.5 (cos(15 (r / 19 + t)) + 1), 1), and its v to 0.

Steps 3 and 4 are read in the code; the savestate cannot check them, holding one step's state.
It does check the counting: its noise counter, 2375019, is 1083 × 2193, three draws for each of
361 points in each of 2193 steps, and its clock, 0.438606, is 2193 × `TIMESTEP` × 0.0001 at night's
`TIMESTEP` of 2. The counter starts at 0 when the object is built, so the lines are deterministic
from their start.

## What the task receives

**Verified** to 4e-7 over all 361 points. A0's point is the interpolated (x, y, z) with y and z
scaled by

s(x) = 1.3 - cos((x - P) π/2) × (1 - S(clamp((x - P) / 5, 0, 1)))

where P is `FFD PARAM 1` and S(m) = m² (3 - 2m), the smoothstep; below P, s is 0.3. Night's P
is -1.83395. That gives 1.97 at a line's start, x = 0, a dip to 1.15 near x = 1.8, and 1.3 from
x = P + 5 on: the lines spread widest where they are anchored and settle to 1.3 times their
simulated spread further out.
