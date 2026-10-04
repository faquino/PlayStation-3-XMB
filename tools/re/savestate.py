#!/usr/bin/env python3
"""Read an RPCS3 savestate's memory by the PS3's own addresses.

RPCS3 writes memory in two sections (vm::save and block_t::save in rpcs3/Emu/Memory/vm.cpp), integers
little-endian:

- the shared memory: a u64 count, then for each its flags (u32), its size (u64) and its bytes;
- the locations: a u64 count, then for each a u8 saying whether it is there and, if it is, its address and size
  (u32 each) and flags (u64), then for each of its mappings a u8 of page flags (0 ends the location), the mapping's
  address and size (u32 each) and either its bytes, for a preallocated location (flags & 0x20), or a u64 index into
  the shared section. A location guarded against stack overflow (flags & 0x10) leaves out a 4 KB page at each end
  of a mapping's bytes.

Bytes are written by serialize_memory_bytes: a bitmap of one byte a kilobyte, bit i set when the kilobyte's line i
(128 bytes) is not all zero, then the lines it marks, in order. So an address finds its mapping, its line's place
among the stored lines and its bytes, and a line left out reads as zero - which is why distances measured in the
raw file across empty memory come out short.

A PRX loads its code and its data at addresses of their own each boot. `module` finds both: the code by a stretch
of it no relocation touches, the data by a function descriptor whose code address and TOC both come out right.

Usage:
  savestate.py <savestate> maps                     the mappings, and where their bytes sit in the file
  savestate.py <savestate> read <address> [bytes]   memory at an address, as words
  savestate.py <savestate> module <prx>             where the PRX's code and data are loaded

Savestates are the `*.SAVESTAT.zst` files RPCS3 writes (Python 3.14's compression.zstd opens them), or their
decompressed images.
"""
import argparse
import struct
import sys
from pathlib import Path

PREALLOCATED = 0x20   # vm::preallocated: the location's bytes are written with it
STACK_GUARDED = 0x10  # vm::stack_guarded
LINE = 128


def load_image(path):
    raw = Path(path).read_bytes()
    if str(path).endswith('.zst'):
        import compression.zstd
        raw = compression.zstd.decompress(raw)
    return raw


class Bytes:
    """One run of serialize_memory_bytes: `size` bytes, of which the lines its bitmap marks are stored."""

    def __init__(self, img, at, size):
        self.img, self.size = img, size
        bitmap = img[at:at + size // 1024]
        self.data = at + len(bitmap)
        self.index = []           # for each line, its place among the stored lines, or -1
        stored = 0
        for byte in bitmap:
            for bit in range(8):
                if byte >> bit & 1:
                    self.index.append(stored)
                    stored += 1
                else:
                    self.index.append(-1)
        self.lines = [i for i, k in enumerate(self.index) if k >= 0]
        self.end = self.data + LINE * stored

    def file_of(self, offset):
        """Where in the file the byte at `offset` is, or None if its line was left out."""
        k = self.index[offset // LINE]
        return None if k < 0 else self.data + LINE * k + offset % LINE

    def read(self, offset, n):
        out = bytearray()
        while n:
            take = min(n, LINE - offset % LINE)
            at = self.file_of(offset)
            out += bytes(take) if at is None else self.img[at:at + take]
            offset += take
            n -= take
        return bytes(out)


def parse(img, start):
    """(mappings as (address, size, Bytes, label), end of the locations) from the shared section's count at `start`."""
    count = struct.unpack_from('<Q', img, start)[0]
    if not 0 < count < 4096:
        raise ValueError('no shared section here')
    p = start + 8
    shared = []
    for _ in range(count):
        flags, size = struct.unpack_from('<IQ', img, p)
        if size == 0 or size % 0x1000 or size > 0x40000000:
            raise ValueError('not a shared entry')
        shared.append(Bytes(img, p + 12, size))
        p = shared[-1].end
    locations = struct.unpack_from('<Q', img, p)[0]
    if not 0 < locations < 64:
        raise ValueError('no locations after the shared section')
    p += 8
    maps = []
    for _ in range(locations):
        has = img[p]
        p += 1
        if has > 1:
            raise ValueError('a location flag that is not 0 or 1')
        if not has:
            continue
        addr, size, flags = struct.unpack_from('<IIQ', img, p)
        p += 16
        while True:
            page = img[p]
            p += 1
            if not page:
                break
            maddr, msize = struct.unpack_from('<II', img, p)
            p += 8
            if flags & PREALLOCATED:
                guard = 0x1000 if flags & STACK_GUARDED else 0
                b = Bytes(img, p, msize - 2 * guard)
                p = b.end
                maps.append((maddr + guard, msize - 2 * guard, b, 'location %#x' % addr))
            else:
                index = struct.unpack_from('<Q', img, p)[0]
                p += 8
                maps.append((maddr, msize, shared[index], 'location %#x, shared %d' % (addr, index)))
    return maps, p


class Memory:
    """The guest memory a savestate holds."""

    def __init__(self, img):
        self.img = img
        for start in range(8, min(len(img), 0x10000)):
            try:
                self.maps, self.end = parse(img, start)
                break
            except (ValueError, IndexError, struct.error):
                continue
        else:
            raise ValueError('no memory sections found')

    def where(self, addr):
        for maddr, msize, b, _ in self.maps:
            if maddr <= addr < maddr + msize:
                return b, addr - maddr
        return None, None

    def read(self, addr, n):
        """n bytes from `addr`, zeros where a line was left out; None outside every mapping."""
        b, offset = self.where(addr)
        return None if b is None else b.read(offset, n)

    def u32(self, addr):
        return struct.unpack('>I', self.read(addr, 4))[0]

    def f32(self, addr):
        return struct.unpack('>f', self.read(addr, 4))[0]

    def address_of(self, at):
        """The guest address the file byte `at` holds, if it is in a stored line."""
        for maddr, msize, b, _ in self.maps:
            if b.data <= at < b.end:
                return maddr + LINE * b.lines[(at - b.data) // LINE] + (at - b.data) % LINE
        return None


def module(mem, prx):
    """(code base, data base) where the PRX's segments are loaded: link address plus base is the load address."""
    code = prx.segments[0]
    touched = set()
    for where in prx.targets:
        touched.update(range(where - 3, where + 8))
    found = None
    for a in range(code['vaddr'] + 0x1000, code['vaddr'] + code['filesz'] - 64, 64):
        if any(x in touched for x in range(a, a + 64)):
            continue
        window = bytes(prx.mem[a:a + 64])
        at = mem.img.find(window)
        if at < 0 or mem.img.find(window, at + 1) >= 0:
            continue
        g = mem.address_of(at)
        if g is not None:
            found = g - a
            break
    if found is None:
        return None, None
    data = prx.segments[1]
    for where, value in prx.targets.items():
        if not (data['vaddr'] <= where < data['vaddr'] + data['filesz'] and code['vaddr'] <= value < code['vaddr'] + code['memsz']):
            continue
        if where % 4 or where + 8 not in range(data['vaddr'], data['vaddr'] + data['filesz'] + 1):
            continue
        toc = prx.u32(where + 4)
        pattern = struct.pack('>I', found + value)
        at = mem.img.find(pattern)
        while at >= 0:
            g = mem.address_of(at)
            if g is not None:
                base = g - where
                if struct.unpack('>I', mem.read(g + 4, 4))[0] == base + toc:
                    return found, base
            at = mem.img.find(pattern, at + 1)
    return found, None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('savestate')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('maps')
    r = sub.add_parser('read')
    r.add_argument('address', type=lambda s: int(s, 0))
    r.add_argument('count', type=lambda s: int(s, 0), nargs='?', default=0x40)
    m = sub.add_parser('module')
    m.add_argument('prx')
    args = ap.parse_args(argv)

    mem = Memory(load_image(args.savestate))
    if args.cmd == 'maps':
        for maddr, msize, b, label in mem.maps:
            print('%#010x + %#9x  %s, %d of %d lines stored at %#x' % (maddr, msize, label, b.end - b.data >> 7,
                                                                      b.size // LINE, b.data))
    elif args.cmd == 'read':
        data = mem.read(args.address, args.count)
        if data is None:
            print('%#x is in no mapping' % args.address)
            return 1
        for i in range(0, len(data), 16):
            print('%#010x  %s' % (args.address + i, data[i:i + 16].hex(' ', 4)))
    else:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from ppu_prx import Prx
        prx = Prx(Path(args.prx).read_bytes())
        code, data = module(mem, prx)
        if code is None:
            print('the code is not in this savestate')
            return 1
        print('code: link %#x loaded at %#x' % (prx.segments[0]['vaddr'], prx.segments[0]['vaddr'] + code))
        if data is None:
            print('data: not found')
        else:
            print('data: link %#x loaded at %#x' % (prx.segments[1]['vaddr'], prx.segments[1]['vaddr'] + data))
    return 0


if __name__ == '__main__':
    sys.exit(main())
