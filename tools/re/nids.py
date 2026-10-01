#!/usr/bin/env python3
"""PS3 function NIDs: compute them from names, and name the imports of PPU modules.

A NID is the first four bytes, read little-endian, of SHA-1(name + a fixed 16-byte
suffix). Verified against vsh.elf, whose five cellSpurs imports resolve to
_cellSpursAttributeInitialize, cellSpursAttributeSetNamePrefix,
cellSpursAttributeSetMemoryContainerForSpuThread, cellSpursInitializeWithAttribute and
cellSpursFinalize.

Import stubs (.lib.stub entries) are 0x2c bytes, big-endian:
  u8 size (0x2c), u8, u16 version, u16 attribute, u16 function count, u16 variable count,
  u16 TLS count, u8 hash, u8 TLS hash, u8[2], then pointers: module name, function NID
  table, function slot table, variable NID table, variable slot table, TLS NID table,
  TLS slot table.

A variable's slot points to a list of 12-byte references, {u32 type, u32 address, u32
addend}, ended by a zero type: every place the loader patches with the variable's address
plus the addend (type 1 a word, 4 the low half, 6 the high half adjusted). The relocations
do not carry them, so until the loader runs those accesses read as small absolute
addresses.

Usage:
  nids.py <module.prx|.elf>            list imports, naming the NIDs it knows
  nids.py --nid <name> [name...]       print NIDs for names
"""

import argparse
import hashlib
import struct
import sys
from pathlib import Path

SUFFIX = bytes.fromhex('6759659904250490566427499489741A')

# Candidate names, from the PS3 SDK. Only names that hash to an imported NID are used, so
# a wrong or missing candidate costs nothing but an unnamed import.
KNOWN = {
    'cellSpurs': """
        _cellSpursAttributeInitialize cellSpursAttributeSetMemoryContainerForSpuThread
        cellSpursAttributeSetNamePrefix cellSpursAttributeEnableSpuPrintfIfAvailable
        cellSpursAttributeSetSpuThreadGroupType cellSpursAttributeEnableSystemWorkload
        cellSpursInitialize cellSpursInitializeWithAttribute cellSpursInitializeWithAttribute2
        cellSpursFinalize cellSpursGetSpuThreadGroupId cellSpursGetNumSpuThread
        cellSpursGetSpuThreadId cellSpursGetInfo cellSpursSetMaxContention cellSpursSetPriorities
        cellSpursSetPriority cellSpursSetPreemptionVictimHints cellSpursAttachLv2EventQueue
        cellSpursDetachLv2EventQueue cellSpursEnableExceptionEventHandler
        cellSpursSetGlobalExceptionEventHandler cellSpursUnsetGlobalExceptionEventHandler
        cellSpursAddWorkload cellSpursAddWorkloadWithAttribute cellSpursShutdownWorkload
        cellSpursWaitForWorkloadShutdown cellSpursRemoveWorkload cellSpursReadyCountStore
        cellSpursReadyCountAdd cellSpursReadyCountCompareAndSwap cellSpursReadyCountSwap
        cellSpursRequestIdleSpu cellSpursGetWorkloadData cellSpursGetWorkloadFlag
        cellSpursGetWorkloadInfo cellSpursSendWorkloadSignal _cellSpursWorkloadAttributeInitialize
        cellSpursWorkloadAttributeSetName cellSpursWorkloadAttributeSetShutdownCompletionEventHook
        cellSpursWakeUp cellSpursCreateTaskset cellSpursCreateTasksetWithAttribute
        _cellSpursTasksetAttributeInitialize _cellSpursTasksetAttribute2Initialize
        cellSpursTasksetAttributeSetName cellSpursTasksetAttributeSetTasksetSize
        cellSpursTasksetAttributeEnableClearLS cellSpursCreateTaskset2 cellSpursShutdownTaskset
        cellSpursJoinTaskset cellSpursDestroyTaskset2 cellSpursGetTasksetId
        cellSpursTasksetGetSpursAddress cellSpursGetTasksetInfo cellSpursLookUpTasksetAddress
        cellSpursTasksetSetExceptionEventHandler cellSpursTasksetUnsetExceptionEventHandler
        cellSpursCreateTask cellSpursCreateTaskWithAttribute cellSpursCreateTask2
        cellSpursCreateTask2WithBinInfo cellSpursSendSignal _cellSpursTaskAttributeInitialize
        _cellSpursTaskAttribute2Initialize cellSpursTaskAttributeSetExitCodeContainer
        cellSpursTaskExitCodeGet cellSpursTaskExitCodeInitialize cellSpursTaskExitCodeTryGet
        cellSpursTaskGetLoadableSegmentPattern cellSpursTaskGetReadOnlyAreaPattern
        cellSpursTaskGenerateLsPattern cellSpursTaskGetContextSaveAreaSize cellSpursJoinTask2
        cellSpursTryJoinTask2 _cellSpursEventFlagInitialize cellSpursEventFlagAttachLv2EventQueue
        cellSpursEventFlagDetachLv2EventQueue cellSpursEventFlagWait cellSpursEventFlagClear
        cellSpursEventFlagSet cellSpursEventFlagTryWait cellSpursEventFlagGetDirection
        cellSpursEventFlagGetClearMode cellSpursEventFlagGetTasksetAddress _cellSpursQueueInitialize
        cellSpursQueuePopBody cellSpursQueuePushBody cellSpursQueueAttachLv2EventQueue
        cellSpursQueueDetachLv2EventQueue cellSpursQueueGetTasksetAddress cellSpursQueueClear
        cellSpursQueueDepth cellSpursQueueGetEntrySize cellSpursQueueSize cellSpursQueueGetDirection
        _cellSpursLFQueueInitialize _cellSpursLFQueuePushBody _cellSpursLFQueuePopBody
        cellSpursLFQueueAttachLv2EventQueue cellSpursLFQueueDetachLv2EventQueue
        cellSpursLFQueueGetTasksetAddress _cellSpursSemaphoreInitialize
        cellSpursSemaphoreGetTasksetAddress cellSpursBarrierInitialize
        cellSpursBarrierGetTasksetAddress cellSpursCreateJobChain cellSpursCreateJobChainWithAttribute
        cellSpursShutdownJobChain cellSpursJoinJobChain cellSpursKickJobChain cellSpursRunJobChain
        cellSpursJobChainGetError cellSpursGetJobChainId cellSpursGetJobChainInfo
        cellSpursJobChainGetSpursAddress cellSpursJobChainSetExceptionEventHandler
        cellSpursJobChainUnsetExceptionEventHandler _cellSpursJobChainAttributeInitialize
        cellSpursJobChainAttributeSetName cellSpursJobChainAttributeSetHaltOnError
        cellSpursJobChainAttributeSetJobTypeMemoryCheck cellSpursAddUrgentCommand
        cellSpursAddUrgentCall cellSpursJobGuardInitialize cellSpursJobGuardNotify
        cellSpursJobGuardReset cellSpursJobSetMaxGrab cellSpursJobHeaderSetJobbin2Param
        cellSpursTraceInitialize cellSpursTraceStart cellSpursTraceStop cellSpursTraceFinalize
        cellSpursGetSpuGuid
    """,
    'sysPrxForUser': """
        sys_initialize_tls sys_process_exit sys_process_atexitspawn sys_process_at_Exitspawn
        sys_ppu_thread_create sys_ppu_thread_get_id sys_ppu_thread_exit sys_ppu_thread_once
        sys_lwmutex_create sys_lwmutex_destroy sys_lwmutex_lock sys_lwmutex_trylock
        sys_lwmutex_unlock sys_lwcond_create sys_lwcond_destroy sys_lwcond_signal
        sys_lwcond_signal_all sys_lwcond_signal_to sys_lwcond_wait sys_time_get_system_time
        sys_prx_load_module sys_prx_start_module sys_prx_stop_module sys_prx_unload_module
        sys_prx_exitspawn_with_level sys_spu_image_import sys_spu_image_close sys_spu_elf_get_information
        sys_spu_elf_get_segments sys_raw_spu_load sys_raw_spu_image_load sys_heap_create_heap
        sys_heap_malloc sys_heap_free sys_heap_memalign sys_heap_delete_heap sys_mmapper_malloc
        _sys_printf _sys_sprintf _sys_snprintf _sys_strlen _sys_strcpy _sys_strncpy _sys_strcmp
        _sys_strncmp _sys_strcat _sys_memset _sys_memcpy _sys_memcmp _sys_memmove _sys_malloc
        _sys_free _sys_memalign _sys_toupper _sys_tolower _sys_vprintf _sys_vsprintf
        _sys_vsnprintf _sys_heap_create_heap _sys_heap_malloc _sys_heap_free sys_get_random_number
        console_getc console_putc console_write sys_process_get_paramsfo
    """,
    'cellGcmSys': """
        cellGcmInit _cellGcmInitBody cellGcmGetConfiguration cellGcmAddressToOffset
        cellGcmMapMainMemory cellGcmMapEaIoAddress cellGcmMapEaIoAddressWithFlags
        cellGcmUnmapEaIoAddress cellGcmUnmapIoAddress cellGcmMapLocalMemory cellGcmIoOffsetToAddress
        cellGcmGetControlRegister cellGcmGetLabelAddress cellGcmGetReportDataAddress
        cellGcmGetReportDataAddressLocation cellGcmGetReportDataLocation cellGcmSetFlipHandler
        cellGcmSetVBlankHandler cellGcmSetDisplayBuffer cellGcmSetFlip cellGcmSetFlipMode
        cellGcmSetFlipStatus cellGcmResetFlipStatus cellGcmGetFlipStatus cellGcmSetWaitFlip
        cellGcmSetPrepareFlip cellGcmSetTile cellGcmSetTileInfo cellGcmBindTile cellGcmUnbindTile
        cellGcmSetZcull cellGcmBindZcull cellGcmUnbindZcull cellGcmGetTiledPitchSize
        cellGcmSetDefaultCommandBuffer cellGcmSetDefaultFifoSize cellGcmCallback
        cellGcmGetDefaultCommandWordSize cellGcmGetDefaultSegmentWordSize cellGcmSetUserHandler
        cellGcmGetCurrentField cellGcmGetLastFlipTime cellGcmGetVBlankCount cellGcmSetSecondVFrequency
    """,
    'sys_io': """
        cellPadInit cellPadEnd cellPadClearBuf cellPadGetData cellPadGetDataExtra cellPadGetInfo
        cellPadGetInfo2 cellPadSetActDirect cellPadSetPressMode cellPadInfoPressMode
        cellPadSetSensorMode cellPadInfoSensorMode cellPadSetPortSetting cellPadGetCapabilityInfo
        cellPadGetRawData cellPadLddRegisterController cellPadLddUnregisterController
        cellPadLddDataInsert cellPadLddGetPortNo cellPadPeriphGetInfo cellPadPeriphGetData
        cellPadFilterIIRInit cellPadFilterIIRFilter cellKbInit cellKbEnd cellKbRead cellKbGetInfo
        cellMouseInit cellMouseEnd cellMouseGetData cellMouseGetInfo
    """,
}


def nid(name):
    return struct.unpack('<I', hashlib.sha1(name.encode() + SUFFIX).digest()[:4])[0]


def name_table():
    table = {}
    for lib, names in KNOWN.items():
        for n in names.split():
            table[nid(n)] = n
    return table


def import_stubs(prx):
    """Yield (module name, [(nid, slot address)]) for every .lib.stub entry."""
    for seg in prx.segments[:2]:
        for a in range(seg['vaddr'], seg['vaddr'] + seg['filesz'] - 0x2c, 4):
            if prx.mem[a] != 0x2c:
                continue
            nf = struct.unpack_from('>H', prx.mem, a + 6)[0]
            name_p, nid_t, slot_t = struct.unpack_from('>III', prx.mem, a + 0x10)
            if not (0 < nf < 3000 and 0 < nid_t < len(prx.mem) and 0 < slot_t < len(prx.mem)):
                continue
            name = prx.cstring(name_p) if 0 < name_p < len(prx.mem) else None
            if not name or len(name) < 3:
                continue
            yield name, [(prx.u32(nid_t + 4 * i), slot_t + 4 * i) for i in range(nf)]


def import_variables(prx):
    """Yield (module name, [(nid, [(type, address, addend)])]) for the variables each .lib.stub entry imports."""
    for seg in prx.segments[:2]:
        for a in range(seg['vaddr'], seg['vaddr'] + seg['filesz'] - 0x2c, 4):
            if prx.mem[a] != 0x2c:
                continue
            nv = struct.unpack_from('>H', prx.mem, a + 8)[0]
            name_p, _, _, vnid_t, vref_t = struct.unpack_from('>5I', prx.mem, a + 0x10)
            if not (0 < nv < 3000 and 0 < vnid_t < len(prx.mem) and 0 < vref_t < len(prx.mem)):
                continue
            name = prx.cstring(name_p) if 0 < name_p < len(prx.mem) else None
            if not name or len(name) < 3:
                continue
            variables = []
            for i in range(nv):
                refs, r = [], prx.u32(vref_t + 4 * i)
                while 0 < r < len(prx.mem) - 12 and prx.u32(r):
                    refs.append((prx.u32(r), prx.u32(r + 4), prx.u32(r + 8)))
                    r += 12
                variables.append((prx.u32(vnid_t + 4 * i), refs))
            yield name, variables


def module_info(prx):
    """(name, export table start, end) of the module info record: u16 attributes, u16 version, a 28-byte name, then
    the TOC and the bounds of the export (0x1c-byte entries) and import (0x2c-byte entries) tables."""
    size = len(prx.mem)
    for a in range(prx.code['vaddr'], prx.code['vaddr'] + prx.code['filesz'] - 52, 4):
        raw = bytes(prx.mem[a + 4:a + 32])
        name = raw.split(b'\0')[0]
        if len(name) < 3 or not all(32 < c < 127 for c in name) or any(raw[len(name):]):
            continue
        _, e0, e1, i0, i1 = struct.unpack_from('>5I', prx.mem, a + 32)
        if 0 < e0 < e1 <= size and 0 < i0 <= i1 <= size and (e1 - e0) % 0x1c == 0 and (i1 - i0) % 0x2c == 0:
            return name.decode(), e0, e1
    return None


def export_variables(prx):
    """Yield (library, nid, address) for every variable the module exports."""
    info = module_info(prx)
    if not info:
        return
    _, a, end = info
    while a < end:
        size = prx.mem[a]
        nf, nv = struct.unpack_from('>HH', prx.mem, a + 6)
        name_p, nid_t, addr_t = struct.unpack_from('>3I', prx.mem, a + 0x10)
        lib = (prx.cstring(name_p) if name_p else None) or '(module)'
        for i in range(nf, nf + nv):
            yield lib, prx.u32(nid_t + 4 * i), prx.u32(addr_t + 4 * i)
        a += size or 0x1c


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('module', type=Path, nargs='?')
    ap.add_argument('--nid', nargs='+', help='print the NIDs of these names')
    args = ap.parse_args(argv)
    if args.nid:
        for n in args.nid:
            print('%08x  %s' % (nid(n), n))
        return 0
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from ppu_prx import Prx
    prx = Prx(args.module.read_bytes())
    names = name_table()
    for module, entries in import_stubs(prx):
        known = sum(1 for n, _ in entries if n in names)
        print('%s: %d functions, %d named' % (module, len(entries), known))
        for n, slot in entries:
            print('   %08x  slot 0x%06x  %s' % (n, slot, names.get(n, '')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
