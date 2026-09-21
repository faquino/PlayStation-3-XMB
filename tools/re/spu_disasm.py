#!/usr/bin/env python3
"""Disassemble Cell SPU ELF executables, such as the SPURS tasks inside lines.qrc.

Opcode numbers follow the public Cell Broadband Engine SPU ISA and were cross-checked
against the decoder table in RPCS3 (rpcs3/Emu/Cell/SPUOpcodes.h). Labels use Ghidra's
naming (FUN_ for brsl/brasl targets, LAB_ for other branch targets) so the output can
be read side by side with SPLINE_REVERSE_ENGINEER.md.

Two annotations make the listing easier to follow, and both are hints from a linear
sweep, not real dataflow analysis:
  - lqr/lqa loads show the quadword they read from the ELF image, as hex and floats;
  - il/ilh/ilhu/iohl/ila chains show the 32-bit constant they build, and its float.

Usage:
  spu_disasm.py <file.elf> [--start ADDR] [--end ADDR]   disassemble .text, or a range
  spu_disasm.py <file.elf> --rodata                       dump .rodata as quadwords
  spu_disasm.py <file.elf> --sections                     list the ELF sections
"""

import argparse
import struct
import sys
from pathlib import Path

LS_SIZE = 0x40000

# (mnemonic, shift, opcode, operand format). An instruction matches when
# word >> (21 + shift) == opcode, so shift 0 is an 11-bit opcode and shift 7 a 4-bit one.
OPCODES = [
    ('stop', 0, 0x000, 'stop'), ('lnop', 0, 0x001, 'none'), ('sync', 0, 0x002, 'none'),
    ('dsync', 0, 0x003, 'none'), ('mfspr', 0, 0x00c, 'mfspr'), ('rdch', 0, 0x00d, 'rdch'),
    ('rchcnt', 0, 0x00f, 'rdch'), ('sf', 0, 0x040, 'rr'), ('or', 0, 0x041, 'rr'),
    ('bg', 0, 0x042, 'rr'), ('sfh', 0, 0x048, 'rr'), ('nor', 0, 0x049, 'rr'),
    ('absdb', 0, 0x053, 'rr'), ('rot', 0, 0x058, 'rr'), ('rotm', 0, 0x059, 'rr'),
    ('rotma', 0, 0x05a, 'rr'), ('shl', 0, 0x05b, 'rr'), ('roth', 0, 0x05c, 'rr'),
    ('rothm', 0, 0x05d, 'rr'), ('rotmah', 0, 0x05e, 'rr'), ('shlh', 0, 0x05f, 'rr'),
    ('roti', 0, 0x078, 'ri7'), ('rotmi', 0, 0x079, 'ri7'), ('rotmai', 0, 0x07a, 'ri7'),
    ('shli', 0, 0x07b, 'ri7'), ('rothi', 0, 0x07c, 'ri7'), ('rothmi', 0, 0x07d, 'ri7'),
    ('rotmahi', 0, 0x07e, 'ri7'), ('shlhi', 0, 0x07f, 'ri7'), ('a', 0, 0x0c0, 'rr'),
    ('and', 0, 0x0c1, 'rr'), ('cg', 0, 0x0c2, 'rr'), ('ah', 0, 0x0c8, 'rr'),
    ('nand', 0, 0x0c9, 'rr'), ('avgb', 0, 0x0d3, 'rr'), ('mtspr', 0, 0x10c, 'mtspr'),
    ('wrch', 0, 0x10d, 'wrch'), ('biz', 0, 0x128, 'bicond'), ('binz', 0, 0x129, 'bicond'),
    ('bihz', 0, 0x12a, 'bicond'), ('bihnz', 0, 0x12b, 'bicond'), ('stopd', 0, 0x140, 'rr'),
    ('stqx', 0, 0x144, 'rr'), ('bi', 0, 0x1a8, 'bi'), ('bisl', 0, 0x1a9, 'bicond'),
    ('iret', 0, 0x1aa, 'bi'), ('bisled', 0, 0x1ab, 'bicond'), ('hbr', 0, 0x1ac, 'hbr'),
    ('gb', 0, 0x1b0, 'rr_ta'), ('gbh', 0, 0x1b1, 'rr_ta'), ('gbb', 0, 0x1b2, 'rr_ta'),
    ('fsm', 0, 0x1b4, 'rr_ta'), ('fsmh', 0, 0x1b5, 'rr_ta'), ('fsmb', 0, 0x1b6, 'rr_ta'),
    ('frest', 0, 0x1b8, 'rr_ta'), ('frsqest', 0, 0x1b9, 'rr_ta'), ('lqx', 0, 0x1c4, 'rr'),
    ('rotqbybi', 0, 0x1cc, 'rr'), ('rotqmbybi', 0, 0x1cd, 'rr'), ('shlqbybi', 0, 0x1cf, 'rr'),
    ('cbx', 0, 0x1d4, 'rr'), ('chx', 0, 0x1d5, 'rr'), ('cwx', 0, 0x1d6, 'rr'),
    ('cdx', 0, 0x1d7, 'rr'), ('rotqbi', 0, 0x1d8, 'rr'), ('rotqmbi', 0, 0x1d9, 'rr'),
    ('shlqbi', 0, 0x1db, 'rr'), ('rotqby', 0, 0x1dc, 'rr'), ('rotqmby', 0, 0x1dd, 'rr'),
    ('shlqby', 0, 0x1df, 'rr'), ('orx', 0, 0x1f0, 'rr_ta'), ('cbd', 0, 0x1f4, 'ri7_mem'),
    ('chd', 0, 0x1f5, 'ri7_mem'), ('cwd', 0, 0x1f6, 'ri7_mem'), ('cdd', 0, 0x1f7, 'ri7_mem'),
    ('rotqbii', 0, 0x1f8, 'ri7'), ('rotqmbii', 0, 0x1f9, 'ri7'), ('shlqbii', 0, 0x1fb, 'ri7'),
    ('rotqbyi', 0, 0x1fc, 'ri7'), ('rotqmbyi', 0, 0x1fd, 'ri7'), ('shlqbyi', 0, 0x1ff, 'ri7'),
    ('nop', 0, 0x201, 'none'), ('cgt', 0, 0x240, 'rr'), ('xor', 0, 0x241, 'rr'),
    ('cgth', 0, 0x248, 'rr'), ('eqv', 0, 0x249, 'rr'), ('cgtb', 0, 0x250, 'rr'),
    ('sumb', 0, 0x253, 'rr'), ('hgt', 0, 0x258, 'rr_ab'), ('clz', 0, 0x2a5, 'rr_ta'),
    ('xswd', 0, 0x2a6, 'rr_ta'), ('xshw', 0, 0x2ae, 'rr_ta'), ('cntb', 0, 0x2b4, 'rr_ta'),
    ('xsbh', 0, 0x2b6, 'rr_ta'), ('clgt', 0, 0x2c0, 'rr'), ('andc', 0, 0x2c1, 'rr'),
    ('fcgt', 0, 0x2c2, 'rr'), ('dfcgt', 0, 0x2c3, 'rr'), ('fa', 0, 0x2c4, 'rr'),
    ('fs', 0, 0x2c5, 'rr'), ('fm', 0, 0x2c6, 'rr'), ('clgth', 0, 0x2c8, 'rr'),
    ('orc', 0, 0x2c9, 'rr'), ('fcmgt', 0, 0x2ca, 'rr'), ('dfcmgt', 0, 0x2cb, 'rr'),
    ('dfa', 0, 0x2cc, 'rr'), ('dfs', 0, 0x2cd, 'rr'), ('dfm', 0, 0x2ce, 'rr'),
    ('clgtb', 0, 0x2d0, 'rr'), ('hlgt', 0, 0x2d8, 'rr_ab'), ('dfma', 0, 0x35c, 'rr'),
    ('dfms', 0, 0x35d, 'rr'), ('dfnms', 0, 0x35e, 'rr'), ('dfnma', 0, 0x35f, 'rr'),
    ('ceq', 0, 0x3c0, 'rr'), ('mpyhhu', 0, 0x3ce, 'rr'), ('addx', 0, 0x340, 'rr'),
    ('sfx', 0, 0x341, 'rr'), ('cgx', 0, 0x342, 'rr'), ('bgx', 0, 0x343, 'rr'),
    ('mpyhha', 0, 0x346, 'rr'), ('mpyhhau', 0, 0x34e, 'rr'), ('fscrrd', 0, 0x398, 'rr_t'),
    ('fesd', 0, 0x3b8, 'rr_ta'), ('frds', 0, 0x3b9, 'rr_ta'), ('fscrwr', 0, 0x3ba, 'rr_ta'),
    ('dftsv', 0, 0x3bf, 'ri7'), ('fceq', 0, 0x3c2, 'rr'), ('dfceq', 0, 0x3c3, 'rr'),
    ('mpy', 0, 0x3c4, 'rr'), ('mpyh', 0, 0x3c5, 'rr'), ('mpyhh', 0, 0x3c6, 'rr'),
    ('mpys', 0, 0x3c7, 'rr'), ('ceqh', 0, 0x3c8, 'rr'), ('fcmeq', 0, 0x3ca, 'rr'),
    ('dfcmeq', 0, 0x3cb, 'rr'), ('mpyu', 0, 0x3cc, 'rr'), ('ceqb', 0, 0x3d0, 'rr'),
    ('fi', 0, 0x3d4, 'rr'), ('heq', 0, 0x3d8, 'rr_ab'),
    ('cflts', 1, 0x1d8, 'ri8_to'), ('cfltu', 1, 0x1d9, 'ri8_to'),
    ('csflt', 1, 0x1da, 'ri8_from'), ('cuflt', 1, 0x1db, 'ri8_from'),
    ('brz', 2, 0x040, 'br_t'), ('stqa', 2, 0x041, 'mem_a'), ('brnz', 2, 0x042, 'br_t'),
    ('brhz', 2, 0x044, 'br_t'), ('brhnz', 2, 0x046, 'br_t'), ('stqr', 2, 0x047, 'mem_r'),
    ('bra', 2, 0x060, 'bra'), ('lqa', 2, 0x061, 'mem_a'), ('brasl', 2, 0x062, 'bra_t'),
    ('br', 2, 0x064, 'br'), ('fsmbi', 2, 0x065, 'imm16_u'), ('brsl', 2, 0x066, 'br_t'),
    ('lqr', 2, 0x067, 'mem_r'), ('il', 2, 0x081, 'imm16_s'), ('ilhu', 2, 0x082, 'imm16_u'),
    ('ilh', 2, 0x083, 'imm16_u'), ('iohl', 2, 0x0c1, 'imm16_u'),
    ('ori', 3, 0x04, 'ri10'), ('orhi', 3, 0x05, 'ri10'), ('orbi', 3, 0x06, 'ri10'),
    ('sfi', 3, 0x0c, 'ri10'), ('sfhi', 3, 0x0d, 'ri10'), ('andi', 3, 0x14, 'ri10'),
    ('andhi', 3, 0x15, 'ri10'), ('andbi', 3, 0x16, 'ri10'), ('ai', 3, 0x1c, 'ri10'),
    ('ahi', 3, 0x1d, 'ri10'), ('stqd', 3, 0x24, 'mem_d'), ('lqd', 3, 0x34, 'mem_d'),
    ('xori', 3, 0x44, 'ri10'), ('xorhi', 3, 0x45, 'ri10'), ('xorbi', 3, 0x46, 'ri10'),
    ('cgti', 3, 0x4c, 'ri10'), ('cgthi', 3, 0x4d, 'ri10'), ('cgtbi', 3, 0x4e, 'ri10'),
    ('hgti', 3, 0x4f, 'ri10_a'), ('clgti', 3, 0x5c, 'ri10'), ('clgthi', 3, 0x5d, 'ri10'),
    ('clgtbi', 3, 0x5e, 'ri10'), ('hlgti', 3, 0x5f, 'ri10_a'), ('mpyi', 3, 0x74, 'ri10'),
    ('mpyui', 3, 0x75, 'ri10'), ('ceqi', 3, 0x7c, 'ri10'), ('ceqhi', 3, 0x7d, 'ri10'),
    ('ceqbi', 3, 0x7e, 'ri10'), ('heqi', 3, 0x7f, 'ri10_a'),
    ('hbra', 4, 0x08, 'hbra'), ('hbrr', 4, 0x09, 'hbrr'), ('ila', 4, 0x21, 'imm18'),
    ('selb', 7, 0x8, 'rrr'), ('shufb', 7, 0xb, 'rrr'), ('mpya', 7, 0xc, 'rrr'),
    ('fnms', 7, 0xd, 'rrr'), ('fma', 7, 0xe, 'rrr'), ('fms', 7, 0xf, 'rrr'),
]

# Instructions that write RT, used to invalidate the constant-chain hint.
NO_RT_WRITE = {'stqd', 'stqa', 'stqr', 'stqx', 'wrch', 'mtspr', 'stop', 'stopd', 'lnop',
               'nop', 'sync', 'dsync', 'br', 'bra', 'brz', 'brnz', 'brhz', 'brhnz',
               'bi', 'iret', 'biz', 'binz', 'bihz', 'bihnz', 'hbr', 'hbra', 'hbrr',
               'heq', 'heqi', 'hgt', 'hgti', 'hlgt', 'hlgti', 'fscrwr'}


def build_table():
    table = [None] * 2048
    for entry in OPCODES:
        _, shift, opcode, _ = entry
        lo = opcode << shift
        for index in range(lo, lo + (1 << shift)):
            if table[index] is not None:
                raise AssertionError('opcode collision: %s and %s' % (table[index][0], entry[0]))
            table[index] = entry
    return table


TABLE = build_table()


def sext(value, bits):
    sign = 1 << (bits - 1)
    return (value & (sign - 1)) - (value & sign)


def as_float(word):
    return struct.unpack('>f', struct.pack('>I', word & 0xFFFFFFFF))[0]


def fmt_float(word):
    value = as_float(word)
    if value != value or value in (float('inf'), float('-inf')):
        return str(value)
    return '%.6g' % value


def reg(n):
    return '$sp' if n == 1 else '$lr' if n == 0 else 'r%d' % n


class SpuElf:
    def __init__(self, raw):
        if raw[:4] != b'\x7fELF' or raw[4] != 1 or raw[5] != 2:
            raise ValueError('not a 32-bit big-endian ELF')
        (machine,) = struct.unpack('>H', raw[18:20])
        if machine != 0x17:
            raise ValueError('not an SPU ELF (e_machine %#x)' % machine)
        self.raw = raw
        (self.entry,) = struct.unpack('>I', raw[0x18:0x1c])
        phoff, shoff = struct.unpack('>II', raw[0x1c:0x24])
        phentsize, phnum, shentsize, shnum, shstrndx = struct.unpack('>HHHHH', raw[0x2a:0x34])

        self.ls = bytearray(LS_SIZE)
        for i in range(phnum):
            p_type, p_offset, p_vaddr, _, p_filesz, _, _, _ = struct.unpack(
                '>8I', raw[phoff + i * phentsize:phoff + i * phentsize + 32])
            if p_type == 1:  # PT_LOAD
                self.ls[p_vaddr:p_vaddr + p_filesz] = raw[p_offset:p_offset + p_filesz]

        self.sections = []
        headers = [struct.unpack('>10I', raw[shoff + i * shentsize:shoff + i * shentsize + 40])
                   for i in range(shnum)]
        strtab = headers[shstrndx][4]
        for sh in headers:
            name = raw[strtab + sh[0]:raw.index(b'\0', strtab + sh[0])].decode()
            self.sections.append({'name': name, 'type': sh[1], 'addr': sh[3], 'offset': sh[4],
                                  'size': sh[5]})

    def section(self, name):
        for sec in self.sections:
            if sec['name'] == name:
                return sec
        raise KeyError(name)

    def word(self, addr):
        return struct.unpack('>I', self.ls[addr:addr + 4])[0]

    def quad(self, addr):
        addr &= LS_SIZE - 16
        return struct.unpack('>4I', self.ls[addr:addr + 16])


def decode(word, pc):
    """Return (mnemonic, operand string, branch target or None, memory address or None)."""
    entry = TABLE[word >> 21]
    if entry is None:
        return '.long', '0x%08x' % word, None, None
    name, _, _, form = entry
    rt, ra, rb = word & 0x7f, (word >> 7) & 0x7f, (word >> 14) & 0x7f
    i16 = (word >> 7) & 0xffff

    if form == 'rr':
        return name, '%s,%s,%s' % (reg(rt), reg(ra), reg(rb)), None, None
    if form == 'rr_ta':
        return name, '%s,%s' % (reg(rt), reg(ra)), None, None
    if form == 'rr_ab':
        return name, '%s,%s' % (reg(ra), reg(rb)), None, None
    if form == 'rr_t':
        return name, reg(rt), None, None
    if form == 'rrr':
        rrr_t, rc = (word >> 21) & 0x7f, word & 0x7f
        return name, '%s,%s,%s,%s' % (reg(rrr_t), reg(ra), reg(rb), reg(rc)), None, None
    if form == 'ri7':
        return name, '%s,%s,%d' % (reg(rt), reg(ra), sext(rb, 7)), None, None
    if form == 'ri7_mem':
        return name, '%s,%d(%s)' % (reg(rt), sext(rb, 7), reg(ra)), None, None
    if form in ('ri8_to', 'ri8_from'):
        i8 = (word >> 14) & 0xff
        scale = 173 - i8 if form == 'ri8_to' else i8 - 155
        return name, '%s,%s,%d' % (reg(rt), reg(ra), scale), None, None
    if form in ('ri10', 'ri10_a'):
        i10 = sext((word >> 14) & 0x3ff, 10)
        if form == 'ri10_a':
            return name, '%s,%d' % (reg(ra), i10), None, None
        return name, '%s,%s,%d' % (reg(rt), reg(ra), i10), None, None
    if form == 'mem_d':
        off = sext((word >> 14) & 0x3ff, 10) << 4
        return name, '%s,%d(%s)' % (reg(rt), off, reg(ra)), None, None
    if form == 'mem_a':
        addr = (sext(i16, 16) << 2) & (LS_SIZE - 1)
        return name, '%s,0x%05x' % (reg(rt), addr), None, addr
    if form == 'mem_r':
        addr = (pc + (sext(i16, 16) << 2)) & (LS_SIZE - 1)
        return name, '%s,0x%05x' % (reg(rt), addr), None, addr
    if form in ('br', 'br_t'):
        target = (pc + (sext(i16, 16) << 2)) & (LS_SIZE - 1)
        ops = '0x%05x' % target if form == 'br' else '%s,0x%05x' % (reg(rt), target)
        return name, ops, target, None
    if form in ('bra', 'bra_t'):
        target = (sext(i16, 16) << 2) & (LS_SIZE - 1)
        ops = '0x%05x' % target if form == 'bra' else '%s,0x%05x' % (reg(rt), target)
        return name, ops, target, None
    if form == 'imm16_s':
        return name, '%s,%d' % (reg(rt), sext(i16, 16)), None, None
    if form == 'imm16_u':
        return name, '%s,0x%x' % (reg(rt), i16), None, None
    if form == 'imm18':
        return name, '%s,0x%x' % (reg(rt), (word >> 7) & 0x3ffff), None, None
    if form in ('hbra', 'hbrr'):
        ro = sext((((word >> 23) & 0x3) << 7) | rt, 9)
        branch = (pc + (ro << 2)) & (LS_SIZE - 1)
        if form == 'hbra':
            target = (i16 << 2) & (LS_SIZE - 1)
        else:
            target = (pc + (sext(i16, 16) << 2)) & (LS_SIZE - 1)
        return name, '0x%05x,0x%05x' % (branch, target), None, None
    if form == 'hbr':
        ro = sext((((word >> 14) & 0x3) << 7) | rt, 9)
        branch = (pc + (ro << 2)) & (LS_SIZE - 1)
        return name, '0x%05x,%s' % (branch, reg(ra)), None, None
    if form == 'bi':
        return name, reg(ra), None, None
    if form == 'bicond':
        return name, '%s,%s' % (reg(rt), reg(ra)), None, None
    if form == 'rdch':
        return name, '%s,ch%d' % (reg(rt), ra), None, None
    if form == 'wrch':
        return name, 'ch%d,%s' % (ra, reg(rt)), None, None
    if form == 'mfspr':
        return name, '%s,spr%d' % (reg(rt), ra), None, None
    if form == 'mtspr':
        return name, 'spr%d,%s' % (ra, reg(rt)), None, None
    if form == 'stop':
        return name, '0x%x' % (word & 0x3fff), None, None
    if form == 'none':
        return name, '', None, None
    raise AssertionError('unhandled operand format %s' % form)


def collect_labels(elf, start, end):
    labels = {}
    for pc in range(start, end, 4):
        name, _, target, _ = decode(elf.word(pc), pc)
        if target is None:
            continue
        if name in ('brsl', 'brasl'):
            labels[target] = 'FUN_%08x' % target
        else:
            labels.setdefault(target, 'LAB_%08x' % target)
    labels.setdefault(elf.entry, 'entry')
    return labels


def constant_hint(name, word, consts):
    """Track il/ilh/ilhu/iohl/ila chains; return a comment once a register holds a known value.

    il gets no comment because its operand already shows the value; ilhu does, because
    a lone ilhu is how the compiler materialises many float constants (0x3f80 is 1.0f).
    """
    rt, i16 = word & 0x7f, (word >> 7) & 0xffff
    if name == 'il':
        consts[rt] = sext(i16, 16) & 0xFFFFFFFF
        return None
    if name == 'ilh':
        consts[rt] = (i16 << 16) | i16
    elif name == 'ilhu':
        consts[rt] = i16 << 16
    elif name == 'ila':
        consts[rt] = (word >> 7) & 0x3ffff
    elif name == 'iohl':
        if rt not in consts:
            return None
        consts[rt] |= i16
    else:
        entry = TABLE[word >> 21]
        if entry is not None and name not in NO_RT_WRITE:
            consts.pop((word >> 21) & 0x7f if entry[1] == 7 else rt, None)
        return None
    value = consts[rt]
    return '%s = 0x%08x (%s)' % (reg(rt), value, fmt_float(value))


def disassemble(elf, start, end, out):
    labels = collect_labels(elf, start, end)
    consts = {}
    for pc in range(start, end, 4):
        if pc in labels:
            out.write('\n%s:\n' % labels[pc])
            consts.clear()
        word = elf.word(pc)
        name, ops, target, addr = decode(word, pc)
        comment = constant_hint(name, word, consts)
        if target is not None and target in labels:
            comment = labels[target]
        elif addr is not None:
            q = elf.quad(addr)
            comment = '[%s] = %s' % (' '.join('%08x' % w for w in q),
                                     ', '.join(fmt_float(w) for w in q))
        line = '  %05x: %08x  %-9s %s' % (pc, word, name, ops)
        out.write(('%-52s # %s\n' % (line, comment)) if comment else line + '\n')


def dump_rodata(elf, out):
    sec = elf.section('.rodata')
    for addr in range(sec['addr'] & ~15, sec['addr'] + sec['size'], 16):
        q = elf.quad(addr)
        out.write('  %05x: %s   %s\n' % (addr, ' '.join('%08x' % w for w in q),
                                         ', '.join('%11s' % fmt_float(w) for w in q)))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('elf', type=Path)
    ap.add_argument('--start', type=lambda s: int(s, 16), help='first address (hex)')
    ap.add_argument('--end', type=lambda s: int(s, 16), help='end address, exclusive (hex)')
    ap.add_argument('--rodata', action='store_true', help='dump .rodata as quadwords')
    ap.add_argument('--sections', action='store_true', help='list the ELF sections')
    args = ap.parse_args(argv)

    elf = SpuElf(args.elf.read_bytes())
    out = sys.stdout
    if args.sections:
        out.write('entry 0x%05x\n' % elf.entry)
        for sec in elf.sections:
            if sec['name']:
                out.write('  %-16s addr=0x%05x size=0x%05x\n' % (sec['name'], sec['addr'], sec['size']))
        return 0
    if args.rodata:
        dump_rodata(elf, out)
        return 0
    text = elf.section('.text')
    start = args.start if args.start is not None else text['addr']
    end = args.end if args.end is not None else text['addr'] + text['size']
    disassemble(elf, start & ~3, end, out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
