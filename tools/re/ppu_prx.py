#!/usr/bin/env python3
"""Load and disassemble PS3 PPU PRX modules decrypted by RPCS3 (Utilities > Decrypt PS3 Binaries).

A decrypted .sprx becomes a 64-bit big-endian PowerPC ELF of type 0xffa4 (SCE PRX): no
section headers, one code segment (text and read-only data), one data segment, and a
PT_SCE_PPURELA segment (type 0x700000a4) of relocations. The module is linked at 0, so
its pointers only make sense once relocated. This tool loads the segments at their
virtual addresses, applies the relocations, and disassembles with capstone, annotating
branch targets and the globals reached through the TOC.

Relocation entries are 24 bytes, big-endian:
  u64 offset       where to patch, relative to the base of segment `index_addr`
  u16 unknown
  u8  index_value  segment whose base is added to `addend`
  u8  index_addr
  u32 type         R_PPC64_*: 1 ADDR32, 4 ADDR16_LO, 5 ADDR16_HI, 6 ADDR16_HA,
                   10 REL24, 11 REL14, 38 ADDR64, 57 ADDR16_LO_DS
  u64 addend

Function descriptors (OPDs) are 8 bytes, {u32 code address, u32 TOC}, so the TOC of
the module is the second word of any descriptor.

Requires capstone (pip install capstone).

Usage:
  ppu_prx.py <file.prx> info
  ppu_prx.py <file.prx> disasm <start hex> <end hex>
  ppu_prx.py <file.prx> find-imm <value> [value...]      li/lis/addi/ori/cmpwi/mulli
  ppu_prx.py <file.prx> xref <address hex>               code that reaches an address
  ppu_prx.py <file.prx> strings [min length]
"""

import argparse
import re
import struct
import sys
from pathlib import Path

PT_LOAD = 1
PT_SCE_PPURELA = 0x700000a4


class Prx:
    def __init__(self, raw):
        if raw[:4] != b'\x7fELF' or raw[4] != 2 or raw[5] != 2:
            raise ValueError('not a 64-bit big-endian ELF')
        e_type, e_machine = struct.unpack('>HH', raw[16:20])
        if e_machine != 0x15:
            raise ValueError('not a PowerPC ELF')
        phoff, = struct.unpack('>Q', raw[32:40])
        phentsize, phnum = struct.unpack('>HH', raw[54:58])
        self.segments = []
        relocs = b''
        for i in range(phnum):
            p = raw[phoff + i * phentsize:phoff + i * phentsize + 56]
            p_type, p_flags, p_offset, p_vaddr, _, p_filesz, p_memsz, _ = struct.unpack('>IIQQQQQQ', p)
            if p_type == PT_LOAD:
                self.segments.append({'vaddr': p_vaddr, 'filesz': p_filesz, 'memsz': p_memsz,
                                      'flags': p_flags, 'data': raw[p_offset:p_offset + p_filesz]})
            elif p_type == PT_SCE_PPURELA:
                relocs = raw[p_offset:p_offset + p_filesz]
        size = max(s['vaddr'] + s['memsz'] for s in self.segments)
        self.mem = bytearray(size)
        for s in self.segments:
            self.mem[s['vaddr']:s['vaddr'] + s['filesz']] = s['data']
        self.relocations = 0
        self.targets = {}
        for off in range(0, len(relocs) - 23, 24):
            self._relocate(*struct.unpack('>QHBBIQ', relocs[off:off + 24]))
        self.code = self.segments[0]
        self.toc = self._find_toc()

    def _relocate(self, offset, _unk, index_value, index_addr, rtype, addend):
        if index_addr >= len(self.segments) or index_value >= len(self.segments):
            return
        where = self.segments[index_addr]['vaddr'] + offset
        value = (self.segments[index_value]['vaddr'] + addend) & 0xffffffffffffffff
        if rtype == 1:
            struct.pack_into('>I', self.mem, where, value & 0xffffffff)
        elif rtype == 38:
            struct.pack_into('>Q', self.mem, where, value)
        elif rtype in (4, 57):
            old = struct.unpack_from('>H', self.mem, where)[0]
            low = value & 0xffff
            struct.pack_into('>H', self.mem, where, (low & ~3) | (old & 3) if rtype == 57 else low)
        elif rtype == 5:
            struct.pack_into('>H', self.mem, where, (value >> 16) & 0xffff)
        elif rtype == 6:
            struct.pack_into('>H', self.mem, where, ((value + 0x8000) >> 16) & 0xffff)
        elif rtype == 10:
            ins = struct.unpack_from('>I', self.mem, where)[0]
            delta = (value - where) & 0x3fffffc
            struct.pack_into('>I', self.mem, where, (ins & 0xfc000003) | delta)
        else:
            return
        self.targets[where] = value
        self.relocations += 1

    def _find_toc(self):
        """The TOC most OPD-looking pairs {code address, data address} agree on.

        In a PRX the candidate pairs are the relocated pointers into code; in an
        executable (no relocations) every word of the data segments is a candidate.
        """
        counts = {}
        data = [s for s in self.segments[1:]]
        code_lo = self.code['vaddr']
        code_end = code_lo + self.code['memsz']

        def in_data(addr, slack=0):
            return any(s['vaddr'] <= addr < s['vaddr'] + s['memsz'] + slack for s in data)

        if self.targets:
            candidates = [w for w, v in self.targets.items() if in_data(w) and code_lo <= v < code_end]
        else:
            candidates = [a for s in data for a in range(s['vaddr'], s['vaddr'] + s['filesz'] - 7, 4)
                          if code_lo <= self.u32(a) < code_end]
        for where in candidates:
            if self.u32(where) & 3:
                continue
            toc = self.u32(where + 4)
            if in_data(toc, 0x10000) and not toc & 3:
                counts[toc] = counts.get(toc, 0) + 1
        return max(counts, key=counts.get) if counts else None

    def u32(self, addr):
        return struct.unpack_from('>I', self.mem, addr)[0]

    def f32(self, addr):
        return struct.unpack_from('>f', self.mem, addr)[0]

    def cstring(self, addr, limit=120):
        if not 0 <= addr < len(self.mem):
            return None
        end = self.mem.find(b'\0', addr, addr + limit)
        if end <= addr:
            return None
        s = bytes(self.mem[addr:end])
        return s.decode('latin1') if all(32 <= c < 127 or c in (9, 10) for c in s) else None


def describe(prx, addr):
    """Human hint for an address: the float or string it holds, or what it points to."""
    if not 0 <= addr < len(prx.mem) - 3:
        return None
    parts = []
    s = prx.cstring(addr)
    if s and len(s) >= 3:
        parts.append(repr(s))
    word = prx.u32(addr)
    if addr in prx.targets:
        target = prx.targets[addr]
        ts = prx.cstring(target)
        parts.append('-> 0x%x%s' % (target, ' %r' % ts if ts and len(ts) >= 3 else ''))
    else:
        f = prx.f32(addr)
        if f == f and 1e-6 < abs(f) < 1e7:
            parts.append('%.6g' % f)
    return ' '.join(parts) or None


def disassemble(prx, start, end, out):
    from capstone import Cs, CS_ARCH_PPC, CS_MODE_64, CS_MODE_BIG_ENDIAN
    md = Cs(CS_ARCH_PPC, CS_MODE_64 | CS_MODE_BIG_ENDIAN)
    code = bytes(prx.mem[start:end])
    for ins in md.disasm(code, start):
        comment = ''
        ops = ins.op_str
        m = re.match(r'r\d+, (-?(?:0x)?[0-9a-f]+)\(r2\)$', ops)
        if m and prx.toc is not None:
            addr = prx.toc + int(m.group(1), 0)
            hint = describe(prx, addr)
            comment = 'toc 0x%x%s' % (addr, ': ' + hint if hint else '')
        elif ins.mnemonic in ('bl', 'b', 'bla') or ins.mnemonic.startswith('b') and ops.startswith('0x'):
            comment = ''
        out.write('  %06x: %08x  %-8s %-28s%s\n' % (ins.address, prx.u32(ins.address), ins.mnemonic, ops,
                                                   ('  # ' + comment) if comment else ''))


def branch_target(ins, addr):
    """Target of an I-form branch (b/bl), or None."""
    if ins >> 26 != 18 or ins & 2:
        return None
    li = ins & 0x3fffffc
    if li & 0x2000000:
        li -= 0x4000000
    return addr + li


def callers(prx, target):
    """Addresses of the bl instructions that call target."""
    code = prx.code
    return [a for a in range(code['vaddr'], code['vaddr'] + code['filesz'], 4)
            if prx.u32(a) & 1 and branch_target(prx.u32(a), a) == target]


def import_stub(prx, slot):
    """Start of the code stub that calls through an import slot, or None.

    PRX stubs load the slot with a relocated lis/lwz pair; executables use absolute
    halves. Either way the stub starts a few instructions before the load.
    """
    code = prx.code
    hi, lo = ((slot + 0x8000) >> 16) & 0xffff, slot & 0xffff
    for a in range(code['vaddr'], code['vaddr'] + code['filesz'] - 4, 4):
        ins = prx.u32(a)
        if ins >> 26 == 32 and ins & 0xffff == lo and (ins >> 16) & 0x1f == 12:
            for back in range(1, 4):
                prev = prx.u32(a - 4 * back)
                if prev >> 26 in (15, 25) and prev & 0xffff in (hi, (slot >> 16) & 0xffff):
                    start = a - 4 * back
                    if prx.u32(start - 4) >> 26 == 14 and (prx.u32(start - 4) >> 21) & 0x1f == 12:
                        start -= 4
                    return start
    return None


def find_immediates(prx, values):
    """Instructions whose 16-bit immediate equals one of the values (or its high half)."""
    hits = []
    code = prx.code
    for addr in range(code['vaddr'], code['vaddr'] + code['filesz'], 4):
        ins = prx.u32(addr)
        op = ins >> 26
        imm = ins & 0xffff
        simm = imm - 0x10000 if imm & 0x8000 else imm
        for v in values:
            if op in (14, 7, 11, 10, 24, 25) and (imm == v & 0xffff or simm == v):
                hits.append((addr, v))
            elif op == 15 and imm == (v >> 16) & 0xffff and v > 0xffff:
                hits.append((addr, v))
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('prx', type=Path)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('info')
    p = sub.add_parser('disasm')
    p.add_argument('start', type=lambda s: int(s, 16))
    p.add_argument('end', type=lambda s: int(s, 16))
    p = sub.add_parser('find-imm')
    p.add_argument('values', nargs='+', type=lambda s: int(s, 0))
    p = sub.add_parser('xref')
    p.add_argument('address', type=lambda s: int(s, 16))
    p = sub.add_parser('strings')
    p.add_argument('min', type=int, nargs='?', default=5)
    p = sub.add_parser('calls', help='callers of each named import (needs nids.py names)')
    p.add_argument('filter', nargs='?', default='', help='only imports whose name contains this')
    p = sub.add_parser('callers')
    p.add_argument('address', type=lambda s: int(s, 16))
    args = ap.parse_args(argv)

    prx = Prx(args.prx.read_bytes())

    if args.cmd == 'info':
        for i, s in enumerate(prx.segments):
            print('segment %d: vaddr 0x%06x filesz 0x%06x memsz 0x%06x' % (i, s['vaddr'], s['filesz'], s['memsz']))
        print('%d relocations applied; TOC = %s' % (prx.relocations, hex(prx.toc) if prx.toc else 'unknown'))
        return 0
    if args.cmd == 'disasm':
        disassemble(prx, args.start, args.end, sys.stdout)
        return 0
    if args.cmd == 'find-imm':
        for addr, v in find_immediates(prx, args.values):
            print('  %06x: %08x   imm for %#x' % (addr, prx.u32(addr), v))
        return 0
    if args.cmd == 'strings':
        for m in re.finditer(rb'[ -~]{%d,}' % args.min, bytes(prx.mem)):
            print('  %06x  %s' % (m.start(), m.group().decode()))
        return 0
    if args.cmd == 'callers':
        for a in callers(prx, args.address):
            print('  0x%06x' % a)
        return 0
    if args.cmd == 'calls':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from nids import import_stubs, name_table
        names = name_table()
        for module, entries in import_stubs(prx):
            for n, slot in entries:
                name = names.get(n, '%s:%08x' % (module, n))
                if args.filter not in name:
                    continue
                stub = import_stub(prx, slot)
                sites = callers(prx, stub) if stub is not None else []
                print('%-48s stub %s  called from %s' % (name, '0x%06x' % stub if stub else '?',
                                                         ', '.join('0x%06x' % s for s in sites) or '-'))
        return 0
    if args.cmd == 'xref':
        target = args.address
        toc_slots = [a for a, v in prx.targets.items() if v == target]
        print('relocated pointers to 0x%x at: %s' % (target, ', '.join('0x%x' % a for a in toc_slots) or 'none'))
        if prx.toc is not None:
            for slot in toc_slots:
                disp = slot - prx.toc
                if -0x8000 <= disp < 0x8000:
                    for addr in range(prx.code['vaddr'], prx.code['vaddr'] + prx.code['filesz'], 4):
                        ins = prx.u32(addr)
                        if (ins >> 16) & 0x1f == 2 and (ins & 0xffff) == disp & 0xffff and ins >> 26 in (32, 58, 14):
                            print('  code at 0x%06x loads it through toc%+d' % (addr, disp))
        return 0


if __name__ == '__main__':
    sys.exit(main())
