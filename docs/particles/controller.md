# The controller

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): how D-pad steps and the Sixaxis
reach the scene, and what they do to the field and the noise. The wind the icons raise as they move
goes through [the flow grid](flow-grid.md#the-flow-grid).

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
- The two factors that weight `PARTICLES_SPE.mnu` are started by `0x2b6a8` and `0x2b6dc`, from
  the same event handler and from the resize method - see
  [What moves the two factors](scene-events.md#what-moves-the-two-factors).

## What the controller does to the block

**Verified** from two more savestates, one taken while the controller was being shaken and
one while the XMB was being navigated sideways, against the one at rest:

| | gravity | friction | rotation vector, y | noise scale |
|---|---|---|---|---|
| at rest | -6.8e-05 | 0.030551 | 0 | 0.225311, `brownian scale` itself |
| shaking | -6.8e-05 | 0.030551 | 1.9e-07 | 1.493472, 6.63 times it |
| navigating | -6.8e-05 | 0.030551 | 1.843731e-05 | 0.719822, 3.19 times it |

- **Both raise the noise, and the particle object says by how much.** The PPU adds two terms
  to `brownian scale`: a level between 0 and 1 times `brownian`, and the controller's motion
  times `rshake brw` - see [How the block is filled](parameter-block.md#how-the-block-is-filled). The block alone
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
  [Navigating does not clear the force and the drag](history.md#navigating-does-not-clear-the-force-and-the-drag).

What writes these is traced in [The controller](#the-controller), and the implementation
ports it.

## Controller input

From the two RSX captures - see [Frame captures](shaders.md#frame-captures).

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
