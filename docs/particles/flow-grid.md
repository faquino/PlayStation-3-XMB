# The flow grid

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the 32 × 16 grid inside the
parameter block, what writes it, and how the task reads it.

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
    [The controller](controller.md#the-controller);
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

## Where the icons are

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
