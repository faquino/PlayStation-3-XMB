#!/usr/bin/env python3
"""Read the particle task's parameter block out of RPCS3 RSX frame captures.

particles.elf DMAs 2304 bytes into local store 0xb200 every frame and reads them at fixed
offsets (PARTICLES_REVERSE_ENGINEER.md). The block lives in RSX-visible memory, which a capture
keeps whole, so it is found by its life bounds at +2048 and read at the task's own offsets:

  +0     force (w ignored)              +2048  _LifeBoundsMin, +2064 _LifeBoundsMax
  +16    drag                           +2096  field centre
  +128   flow grid, 32 x 16 cells of    +2112  field rotation matrix
         three signed bytes: x, y, z    +2176  field rotation vector
  +1792  M2, grid to world              +2192  noise offset
  +1856  M1, world to grid              +2208  flow strength, noise scale, size middle, spin rate
  +1920  grid descriptor                +2224  time step

Captures accumulate: each one also carries the blocks of the captures taken before it in the
same session, marked 'old' here. Savestates are no use for this: they leave out every 128-byte
line of memory that is entirely zero, which takes the empty grid out of the block and moves
everything after it.

Usage:
  readblock.py <capture.rrc.gz> [more captures ...]
"""
import argparse
import gzip
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rrc

SIZE = 2304
BOUNDS = 2048
GRID, GRID_W, GRID_H = 128, 32, 16
BOUNDS_MIN = struct.pack('>3f', -10, -10, -12)
BOUNDS_MAX = struct.pack('>3f', 10, 10, 7)


def vec(block, offset):
    return struct.unpack_from('>4f', block, offset)


def find_blocks(capture):
    """{block bytes: whether the capture's own memory map references it}, one entry per distinct block."""
    live = {data_key for _, _, data_key in capture.blocks.values()}
    found = {}
    for data_key, blob in capture.block_data.items():
        at = blob.find(BOUNDS_MIN)
        while at >= 0:
            start = at - BOUNDS
            if blob[at + 16:at + 28] == BOUNDS_MAX and start >= 0 and start + SIZE <= len(blob):
                block = bytes(blob[start:start + SIZE])
                found[block] = found.get(block, False) or data_key in live
            at = blob.find(BOUNDS_MIN, at + 1)
    return found


def grid_cells(block):
    """The flow grid's non-empty cells, as (row, column, (x, y, z))."""
    cells = []
    for cell in range(GRID_W * GRID_H):
        raw = block[GRID + 3 * cell:GRID + 3 * cell + 3]
        if any(raw):
            cells.append((cell // GRID_W, cell % GRID_W, struct.unpack('3b', raw)))
    return cells


def show(path):
    blocks = find_blocks(rrc.Capture(gzip.open(path, 'rb').read()))
    print('%s: %s' % (path.name, '%d block(s)' % len(blocks) if blocks else 'no particle block'))
    for block, live in sorted(blocks.items(), key=lambda item: not item[1]):
        force, drag, rotation = vec(block, 0), vec(block, 16), vec(block, 2176)
        knobs, dt = vec(block, 2208), vec(block, 2224)
        print('  %s force (%g, %g, %g)  drag %g  rotation (%.4g, %.4g, %.4g)  flow %g  noise %g  dt %g'
              % ('live' if live else 'old ', *force[:3], drag[0], *rotation[:3], knobs[0], knobs[1], dt[0]))
        cells = grid_cells(block)
        # So far only y has ever been written, so a cell prints as its y alone unless x or z is set.
        print('       grid: ' + (' '.join('(%d,%d)%s' % (row, col, '%+d' % v[1] if not (v[0] or v[2]) else str(v))
                                          for row, col, v in cells) or 'empty'))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('captures', nargs='+', type=Path)
    for path in parser.parse_args().captures:
        show(path)


if __name__ == '__main__':
    main()
