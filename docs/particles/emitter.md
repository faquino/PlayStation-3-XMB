# Emission and the pool

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the wave the particles are born
on, the emitter, and what the pool and the captures say about both.

## The wave

From the two RSX captures - see [Frame captures](shaders.md#frame-captures).

- `lines1.vpo` draws the wave from a 16384-vertex buffer in main memory, written by
  `spline.elf`. Positions are already in clip space: w is the view depth. A second vec4 is
  probably a normal (inferred), and uv is static.
- The buffer is 128 lines of 128 vertices, one line after the other: u is the line's index
  over 127, and along a line x runs from the right edge, 1.45 in normalised coordinates, to
  the left, -1.55.
- The particles fill the same depth slab as the wave: view z [-11.6, -4.4] against
  [-10.8, -4.5]. Projected to the screen, they cluster tightly around the wave and thin
  out with distance from it. They are born on its vertices - see [The emitter](#the-emitter).

## The emitter

**Verified** in `custom_render_plugin`. The per-frame update, `0x31494`, ends by calling
`0x30b80`, which runs the two ways particles are born and turns each birth into commands for the
pool.

**Which vertices.** The emitter draws from the wave's own vertices, the 128 lines of 128 that
`spline.elf` writes - see [The wave](#the-wave). Vertex ix of line iy sits at 32 × (128 iy + ix)
in the buffer, and a matrix the particle object keeps at `+0x50` takes it into the world
(`0x2d6e8`, `0x2d640`), times the vertex's x, y, z and w with no division. Every frame, just before
the particle update, the scene hands the object the buffer the wave's renderer holds as current,
its 128 × 128 and that matrix (`0x2b288`, from `0x32244`), and in every savestate the matrix is the
camera's exact inverse: x times 0.886367, tan 26.5° × 16/9, y times 0.498582, and z and w those of
a projection with near 0.1 and far 1000, so w comes out 1 and z is 2 less the view depth. Two
sources pick them:

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
- type 3 (`0x59140`) adds its vector to the velocity's x, y and z and leaves the aging rate in
  w: an impulse. Nothing queues it. The emitter is the only code that writes commands, and it
  writes types 0, 1, 2 and 4.

The runner drops the frame's commands while a byte of the first block, at +2080, is set. The
block's constructor clears it and its copy carries it over, and nothing else writes it.

Nothing writes the orientation: a new particle keeps the quaternion its slot's last particle
left.

## The pool

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
- **Emission velocity, from the particles younger than 3% of a life:** in xy 0.098 / 0.224 /
  0.348 at the 5th, 50th and 95th percentile, pooled over the six savestates taken at rest, 312 of
  them; one savestate's median runs from 0.192 to 0.276 with how fast its wave moves. The speed is
  not `emit vel min` + `emit vel var` × U(0, 1), as first read, but grows as the square root of the
  wave's own speed - see [The emitter](#the-emitter). The resting savestate's own, read below, are
  among the fastest.
- **Their z velocity is zero**: |vz| / |v| has a median of 0.005 at birth. `emit vel
  zscale` being 0 flattens emission into the screen plane.
- **The direction is a cone around the vertical**: |vy| / |v| has a median of 0.838,
  where a cone of `emit cone angle` 51.87° around y gives 0.809. The cone's axis is the way
  the wave moves where the particle is born, which is mostly up and down.
- **The noise builds up over a life:** |vz| / |v| climbs to 0.05, 0.20 and 0.34 at a
  tenth, a half and nine tenths of a life, and in the resting savestate the median speed grows
  from 0.276 to 0.324 while the 95th percentile goes from 0.348 to 0.633. Nothing else pushes a
  particle in z.

### Binned by life

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
  percentile. `ps3xmbwave/` now emits from the console's own mesh, which puts its band at
  7.75 / 8.97 / 10.49 - see [Against the console](implementation.md#against-the-console).
- **The x and y velocities at birth run to about 0.3**, which `emit vel min` 0.15064 and
  `emit vel mul` 0.19 bracket.

**The aging law comes out exactly.** Over all 2033 particles the rate runs from 0.001447 to
0.004256, against the 0.001446 to 0.004259 that `aging speed` 0.00285223 and `aging variance`
0.493003 give as `speed x (1 +- variance)` - which is the symmetric reading this branch changed
to. The median is 0.002435, not the 0.002852 of a uniform draw, because slow particles live
longer and a snapshot over-counts them: for a 1/rate weighting the median is the geometric mean,
sqrt(0.001446 x 0.004259) = 0.002482, and that is what is there.

## Emission, as the captures show it

**Inferred** from the two RSX captures, before the emitter's code was found. The readings below
still hold with [the emitter](#the-emitter) traced; the particle count they were used to estimate is
in [history](history.md#emission-before-the-emitter-was-traced).

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

- **Particles stay at the depth where they were born.** In every NDC x bin, the median
  particle depth is within about 0.2 of the wave's. They barely move in z, which fits
  `emit vel zscale` 0.
- **How far they stray.**
  - 75% of the on-screen particles lie inside the wave's vertical band, measured per x.
  - Outside it, the 90th percentile of the distance is 0.10 to 0.11 NDC and the 99th is
    0.38 to 0.39.
