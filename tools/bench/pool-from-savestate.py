#!/usr/bin/env python3
"""Read the particle pool out of an RPCS3 savestate and print the console column of the bench.

The task's pool is an array of 48-byte records - position and life, velocity and aging rate,
rotation quaternion - and a free slot has position.w = -666. That marker is what finds the array:
its offsets all sit at the same distance modulo 48, and the run of plausible records around them
is the pool. `tools/bench/particles.js` prints the same rows for the simulation, so the two sit
side by side.

The slot count is whatever the walk reaches, which can stop a record short of the real pool
when one is caught mid-write; the numbers below it are unaffected.

Usage: pool-from-savestate.py <vsh.self_1_1.SAVESTAT.zst | decompressed.bin>
"""
import argparse
import struct
import sys
from pathlib import Path

RECORD = 48          # bytes per pool slot
FREE = -666.0        # position.w of a free slot
EYE_Z = 2.0          # the camera's z, so view depth is EYE_Z - position.z
AGING_RANGE = (1e-4, 2e-2)


def load(path):
    raw = path.read_bytes()
    if path.suffix == '.zst':
        from compression import zstd
        return zstd.decompress(raw)
    return raw


def plausible(data, base):
    """A record that could be a particle: a life in [0, 1] and an aging rate in range."""
    if base < 0 or base + RECORD > len(data):
        return False
    life, aging = struct.unpack('>f', data[base + 12:base + 16])[0], struct.unpack('>f', data[base + 28:base + 32])[0]
    if life == FREE:
        return True
    return 0.0 <= life <= 1.0 and AGING_RANGE[0] <= aging <= AGING_RANGE[1]


def find_pool(data):
    """The longest run of plausible records around the free markers, as (base, slots)."""
    marker = struct.pack('>f', FREE)
    starts = []
    pos = data.find(marker)
    while pos != -1:
        # No alignment filter: a savestate's memory image is not aligned to the file.
        starts.append(pos - 12)
        pos = data.find(marker, pos + 1)
    if not starts:
        raise SystemExit('no free markers: this savestate has no particle pool in it')

    classes = {}
    for start in starts:
        classes.setdefault(start % RECORD, []).append(start)
    best = None
    for _, group in sorted(classes.items(), key=lambda kv: -len(kv[1])):
        base = min(group)
        while plausible(data, base - RECORD):
            base -= RECORD
        slots = 0
        while plausible(data, base + slots * RECORD) and slots < 8192:
            slots += 1
        if best is None or slots > best[1]:
            best = (base, slots)
    return best


def quantile(values, f):
    values = sorted(values)
    return values[int(f * (len(values) - 1))]


def three(values, digits):
    return ' / '.join(('%+.*f' if digits >= 4 else '%.*f') % (digits, quantile(values, f))
                      for f in (0.05, 0.5, 0.95))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('savestate', type=Path)
    args = ap.parse_args(argv)

    data = load(args.savestate)
    base, slots = find_pool(data)
    alive, aging = [], []
    for i in range(slots):
        off = base + i * RECORD
        p = struct.unpack('>4f', data[off:off + 16])
        v = struct.unpack('>4f', data[off + 16:off + 32])
        if p[3] == FREE or not any(p[:3]):
            continue
        alive.append((p, v))
        aging.append(v[3])

    bands = {'just born (life under 0.03)': [r for r in alive if r[0][3] < 0.03],
             'late in life (over 0.5)': [r for r in alive if r[0][3] >= 0.5]}

    print('%s: pool at %#x, %d slots' % (args.savestate.name, base, slots))
    print('  %-32s %d of %d' % ('Alive', len(alive), slots))
    print('  %-32s %.6f / %.6f / %.6f' % ('Aging rate, min / median / max',
                                          min(aging), quantile(aging, 0.5), max(aging)))
    for label, rows in bands.items():
        print('  -- %s: %d particles' % (label, len(rows)))
        print('  %-32s %s' % ('View depth', three([EYE_Z - r[0][2] for r in rows], 2)))
        print('  %-32s %s' % ('Velocity z', three([r[1][2] for r in rows], 4)))
        print('  %-32s %s' % ('Speed in xy', three([(r[1][0] ** 2 + r[1][1] ** 2) ** 0.5 for r in rows], 3)))


if __name__ == '__main__':
    sys.exit(main())
