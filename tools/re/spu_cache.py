#!/usr/bin/env python3
"""Match RPCS3's SPU program cache against an SPU ELF, to see which of its code really ran.

RPCS3 records every SPU program it compiles in cache/<title>/.../spu-*.dat. The file has
no header; each record is, big-endian:
  u32  (crc16 << 16) | number of instruction words
  u32  entry point (local store address)
  u32  instruction words, starting at the entry point

SPURS tasks are loaded at their ELF addresses, so a record belongs to an ELF when its
words equal the ELF's own words at the same local store address.

The cache only grows, so it doubles as a coverage recorder: keep a copy, exercise some
behaviour in the emulator (shake the controller, move across icons), and --since shows
exactly which code of the ELF ran for the first time.

Usage:
  spu_cache.py list  <spu.dat>
  spu_cache.py match <spu.dat> <file.elf> [--ranges] [--since OLD.dat]
"""

import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spu_disasm import SpuElf  # noqa: E402


def records(raw):
    off = 0
    while off + 8 <= len(raw):
        head, entry = struct.unpack('>II', raw[off:off + 8])
        count = head & 0xffff
        end = off + 8 + count * 4
        if end > len(raw):
            raise ValueError('truncated record at file offset %#x' % off)
        yield entry, raw[off + 8:end]
        off = end


def coverage(recs, elf, lo, hi):
    """Return (covered word addresses, matching record count, partial matches)."""
    covered, matched, partial = set(), 0, []
    for entry, words in recs:
        if not lo <= entry < hi:
            continue
        n = len(words) // 4
        same = [elf.ls[entry + i * 4:entry + i * 4 + 4] == words[i * 4:i * 4 + 4] for i in range(n)]
        if all(same):
            matched += 1
            covered.update(a for a in range(entry, entry + n * 4, 4) if a < hi)
        elif sum(same) > n // 2:
            partial.append((entry, n, n - sum(same)))
    return covered, matched, partial


def ranges(addrs):
    """Merge word addresses into [start, end) runs."""
    runs = []
    for a in sorted(addrs):
        if runs and runs[-1][1] == a:
            runs[-1][1] = a + 4
        else:
            runs.append([a, a + 4])
    return runs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    p_list = sub.add_parser('list', help='list the cached programs')
    p_list.add_argument('dat', type=Path)
    p_match = sub.add_parser('match', help='find the cached programs that belong to an ELF')
    p_match.add_argument('dat', type=Path)
    p_match.add_argument('elf', type=Path)
    p_match.add_argument('--ranges', action='store_true', help='print the executed .text ranges')
    p_match.add_argument('--since', type=Path, help='only report code not covered by this older .dat')
    args = ap.parse_args(argv)

    recs = list(records(args.dat.read_bytes()))

    if args.cmd == 'list':
        for entry, words in recs:
            print('0x%05x  %5d words' % (entry, len(words) // 4))
        print('%d programs' % len(recs))
        return 0

    elf = SpuElf(args.elf.read_bytes())
    text = elf.section('.text')
    lo, hi = text['addr'], text['addr'] + text['size']
    total = text['size'] // 4
    covered, matched, partial = coverage(recs, elf, lo, hi)

    for entry, n, bad in sorted(partial):
        print('partial  0x%05x  %5d words, %d differ (code shared with another ELF?)' % (entry, n, bad))
    print('%d programs match; they cover %d of %d .text words (%.1f%%)'
          % (matched, len(covered), total, 100.0 * len(covered) / total))

    if args.since:
        old, _, _ = coverage(list(records(args.since.read_bytes())), elf, lo, hi)
        new = covered - old
        print('%d words ran for the first time since %s:' % (len(new), args.since.name))
        for start, end in ranges(new):
            print('  0x%05x-0x%05x  %4d words' % (start, end, (end - start) // 4))
    elif args.ranges:
        for start, end in ranges(covered):
            print('  0x%05x-0x%05x  %4d words' % (start, end, (end - start) // 4))
    return 0


if __name__ == '__main__':
    sys.exit(main())
