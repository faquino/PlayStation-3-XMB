#!/usr/bin/env python3
"""Which call sites of a PPU module the stacks in an RPCS3 savestate remember, and so which functions ran.

Every call stores its return address in the caller's frame, and a stack keeps stale frames below
its pointer until something reuses them, so a savestate holds return addresses from the recent past
of every PPU thread - how recent, it cannot say. A frame is recognised by its layout under the
64-bit ABI: the back chain, a 64-bit pointer to a stack, then the CR word, then the saved LR, a
64-bit value whose upper half is zero. Each distinct saved LR is a candidate return address.

A relocatable module (PRX) loads at a different address each boot, and its own code does not say
where: a relocated `lis`/`lfs` pair reads back an absolute address, but short code sequences recur
across modules, so a match in the savestate can be another module's copy. The load address is voted
for instead: every candidate, paired with every `bl` of the module, votes for the page-aligned base
that would make it that `bl`'s return address, and a whole module's worth of return addresses piles
up on the true base. The winner is then checked. Of the candidates that land in the code at that
base, the share right after a `bl` is chance level at a wrong base - a tenth or so - and most of
them at the right one: vsh.elf, which loads where it is linked, gives two thirds in every savestate
tried. Below `--min-share` the module is reported as absent from the stacks rather than placed.

In the savestates tried, no PRX module has a frame on the stacks - not even xmb_plugin, which runs
all the time, checked at the load address its module info record gives - so vsh.elf is the only
module placed so far, and one reported absent may still have run.

A savestate leaves out all-zero 128-byte lines, which moves memory around but leaves every value as
it is. What this cannot see: leaf functions, which never store a return address, frames already
reused, and stacks outside 0x20000000-0x3fffffff and 0xd0000000-0xdfffffff.

Usage:
  coverage.py <module> <savestate> [more ...]                  where it sits, and the functions with call sites
  coverage.py <module> <savestate> [more ...] --sites          every call site, with its target
  coverage.py <module> <savestate> [more ...] --unique <name>  call sites in that savestate and in no other

Savestates are the `*.SAVESTAT.zst` files RPCS3 writes (Python 3.14's compression.zstd opens them),
or their decompressed images.
"""
import argparse
import re
import struct
import sys
from bisect import bisect_right
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ppu_prx import Prx, branch_target

PAGE = 0x1000
# back chain (upper half zero, lower half in a stack region), CR word, then the saved LR (upper half zero)
FRAME = re.compile(b'(?=\\x00\\x00\\x00\\x00[\\x20-\\x3f\\xd0-\\xdf]...........\\x00\\x00\\x00\\x00(....))', re.S)


def load_image(path):
    raw = path.read_bytes()
    if path.suffix == '.zst':
        import compression.zstd
        raw = compression.zstd.decompress(raw)
    return raw


def saved_returns(image):
    """Distinct saved-LR values of every frame-shaped slot in the image."""
    found = set()
    for m in FRAME.finditer(image):
        v = struct.unpack('>I', m.group(1))[0]
        if v % 4 == 0 and v >= 0x10000:
            found.add(v)
    return found


def is_bl(word):
    return word >> 26 == 18 and word & 3 == 1


class Module:
    def __init__(self, path):
        self.prx = Prx(path.read_bytes())
        code = self.prx.code
        self.lo, self.hi = code['vaddr'], code['vaddr'] + code['filesz']
        self.relocatable = bool(self.prx.targets)
        self.returns = [a + 4 for a in range(self.lo, self.hi, 4) if is_bl(self.prx.u32(a))]
        self.starts = sorted({branch_target(self.prx.u32(r - 4), r - 4) for r in self.returns} &
                             set(range(self.lo, self.hi, 4)))

    def function_of(self, address):
        i = bisect_right(self.starts, address) - 1
        return self.starts[i] if i >= 0 else self.lo

    def call_sites(self, values, base):
        """(values landing in the code at this base, the call sites among them)."""
        inside = [v - base for v in values if self.lo + 4 <= v - base < self.hi]
        return len(inside), sorted(r - 4 for r in inside if is_bl(self.prx.u32(r - 4)))

    def place(self, values):
        """(base, votes, runner-up votes): the load address less the link address; votes are None if fixed."""
        if not self.relocatable:
            return 0, None, None
        by_page_offset = defaultdict(list)
        for r in self.returns:
            by_page_offset[r % PAGE].append(r)
        votes = Counter()
        for v in values:
            for r in by_page_offset.get(v % PAGE, ()):
                if v > r:
                    votes[v - r] += 1
        ranked = votes.most_common(2) + [(None, 0), (None, 0)]
        return ranked[0][0], ranked[0][1], ranked[1][1]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('module', type=Path)
    ap.add_argument('savestates', type=Path, nargs='+')
    ap.add_argument('--sites', action='store_true', help='list every call site with its target')
    ap.add_argument('--unique', metavar='NAME',
                    help='call sites found in the savestate whose file name contains NAME and in no other')
    ap.add_argument('--min-share', type=float, default=0.5,
                    help='share of in-code values that must follow a bl to accept a base (default 0.5)')
    args = ap.parse_args(argv)

    module = Module(args.module)
    found = {}
    for path in args.savestates:
        values = saved_returns(load_image(path))
        base, top, second = module.place(values)
        inside, sites = module.call_sites(values, base) if base is not None else (0, [])
        votes = '' if top is None else ' (%d votes, runner-up %d)' % (top, second)
        where = '%#x%s' % (module.lo + base, votes) if base is not None else 'nowhere'
        if not inside or len(sites) < args.min_share * inside:
            print('%s: not on the stacks - best guess %s, %d of %d values after a bl' % (
                path.name, where, len(sites), inside))
            continue
        found[path.name] = sites
        print('%s: code at %s, %d of %d values after a bl' % (path.name, where, len(sites), inside))
    if not found:
        return 1

    seen = defaultdict(set)
    for name, sites in found.items():
        for site in sites:
            seen[site].add(name)

    if args.unique:
        names = [n for n in found if args.unique in n]
        if len(names) != 1:
            print('--unique %s matches %d of the savestates the module was found in' % (args.unique, len(names)))
            return 1
        only = sorted(s for s, where in seen.items() if where == {names[0]})
        print('%d call sites only in %s:' % (len(only), names[0]))
        for s in only:
            print('  %#08x -> %#08x  in function %#08x' % (s, branch_target(module.prx.u32(s), s),
                                                         module.function_of(s)))
        return 0

    if args.sites:
        for s in sorted(seen):
            print('  %#08x -> %#08x  in %d of %d' % (s, branch_target(module.prx.u32(s), s), len(seen[s]),
                                                    len(found)))
        return 0

    functions = defaultdict(lambda: [set(), 0])
    for s, where in seen.items():
        f = functions[module.function_of(s)]
        f[0] |= where
        f[1] += 1
    print('%d of %d functions hold a call site:' % (len(functions), len(module.starts)))
    for f in sorted(functions):
        print('  %#08x  in %d of %d, %d call sites' % (f, len(functions[f][0]), len(found), functions[f][1]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
