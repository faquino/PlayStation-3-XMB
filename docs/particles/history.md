# History: superseded readings, closed investigations and dead ends

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md). Nothing here is needed for
everyday work: the topics hold what is known now, and each section below says which one it belongs
to. Read it to reopen a question, or before following a lead that may already be ruled out.

## Ruled out

Leads that went nowhere, kept so that nobody follows them again.

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

## The grid's writer

Topic: [The flow grid](flow-grid.md#the-flow-grid). How its writer was found, and what the
savestates' stacks could not say.

**Verified.** It is in `custom_render_plugin`: `0x2f90c` writes the icon wind into the first
block's grid, once for every icon drawn, and `0x2c588` decays the grid every frame - see
[The flow grid](flow-grid.md#the-flow-grid) for the rule. The search that missed it went through
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

## The first-run wizard, the saved-data utility and the welcome sets

Topic: [The XMB starts by fading out of
`coldboot1`](parameter-sets.md#the-xmb-starts-by-fading-out-of-coldboot1). The code has since
overtaken the placing of the `welcome` sets below: nothing in 4.93 applies them - see [What puts
each set in](parameter-sets.md#what-puts-each-set-in).

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

## How the day cycle was measured

Topic: [Themes blend over hours](day-cycle.md#themes-blend-over-hours).

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

**The fourth window, measured.** RPCS3's *Console time offset* moves the emulated clock
without waiting for the hour, and a savestate taken with it at 01:31 reads `glare` 0.160707.
Night into `yoake` puts that at 0.0481 of the way through. The predicted smoothstep is 0.0457
at 01:31 and 0.0486 at 01:32 - the savestate was written a minute after the screenshot, so it
lands at 01:31.9. A straight line over the same window would be at 0.133, nearly three times
as far, and a window opening at midnight would be at 0.36.

## Emission before the emitter was traced

Topic: [Emission, as the captures show it](emitter.md#emission-as-the-captures-show-it). What the
captures were taken to say about the count, and the modelled emitter the traced one replaced:

- **That accounts for the particle count.**
  - 16.6539 × 0.479115 = 7.98 emissions per frame (`emit per frame` × `emit prob`) - 16 ×
    0.479115 = 7.67 as the emitter counts them.
  - 86% of them land inside the box.
  - With aging rates uniform between 1 and 1 + `aging variance` times `aging speed`, a
    life lasts ln(1.493) / 0.493 / 0.00285 ≈ 285 frames on average.
  - 7.98 × 0.86 × 285 ≈ 1950, against 2028 and 2041 captured.
  - This needs life to advance by the aging rate once per frame, so the w component of
    the time step is 1.

This replaces the modelled emitter on every count: one draw per attempt with the fraction
carried, from random points of the surface, in a cone around its normal, at `emit vel min` +
`emit vel var` × U, flattened and renormalised, with a random orientation and no sweeps.

## The noise's drift

Topic: [Against the console](implementation.md#against-the-console). What made the particles drift
too far late in life while the emitter was modelled, and what was ruled out on the way:

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

## Navigating does not clear the force and the drag

Topic: [What the controller does to the block](controller.md#what-the-controller-does-to-the-block).

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

## Superseded readings

- [The parameter block](parameter-block.md#the-parameter-block-read-out-of-a-savestate) is the
  task's whole 2304-byte transfer. That replaces an earlier reading, that the task DMAs three
  768-byte structures and takes its force from the head of the third: that head is zero in every
  capture.

## A note on the spline document

Validating the disassembler against `spline.elf` turned up two errors in
`SPLINE_REVERSE_ENGINEER.md`: the 1/6 constant and the kernel's per-iteration stride. Both
are corrected there.
