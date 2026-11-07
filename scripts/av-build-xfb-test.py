#!/usr/bin/env python3
"""Generate an original Wii DOL that configures VI to scan out grayscale YUYV bars.
No Nintendo binary, firmware, SDK or libogc code is included. Register semantics:
Dolphin e22551e, Source/Core/Core/HW/VideoInterface.{h,cpp}.
This is a VI/XFB scanout test; it does not exercise GX triangle rasterization.
"""
from pathlib import Path
import hashlib
import json
import struct

BASE = 0x80004000
XFB = 0x80100000
RESULT = 0x90100000
WIDTH, HEIGHT = 320, 240
LUMA = [16, 48, 80, 112, 144, 176, 208, 235]
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'graphics' / 'homebrew'

def d(op, rt, ra, imm):
    return (op << 26) | (rt << 21) | (ra << 16) | (imm & 0xffff)

def program():
    code = []
    def emit(word): code.append(word)
    def constant(reg, value):
        emit(d(15, reg, 0, value >> 16))
        emit(d(24, reg, reg, value))
    def half(offset, value):
        constant(4, value)
        emit(d(44, 4, 3, offset))
    def word(offset, value):
        constant(4, value)
        emit(d(36, 4, 3, offset))
    # r3 points at the VI MMIO page. Disable timing during configuration.
    constant(3, 0xcc002000)
    half(0x02, 0)
    word(0x04, (71 << 24) | (105 << 16) | 429)
    word(0x08, (373 << 17) | (162 << 7) | 64)
    word(0x0c, (5 << 16) | (502 - HEIGHT * 2))
    word(0x10, (4 << 16) | (503 - HEIGHT * 2))
    # XFB physical byte address, POFF=0. Both fields scan the same full image.
    word(0x1c, XFB & 0x3fffffff)
    word(0x24, XFB & 0x3fffffff)
    half(0x48, ((WIDTH // 16) << 8) | (WIDTH // 16))
    half(0x4a, 0)  # no horizontal scaling
    # No external interrupt handler is installed in this bare-metal program.
    for offset in (0x30, 0x34, 0x38, 0x3c): word(offset, 0)
    half(0x00, (HEIGHT << 4) | 6)
    half(0x02, 5)  # ENB=1, NIN=1, NTSC
    emit(0x7c0004ac)  # sync: complete MMIO writes before publishing marker
    constant(3, RESULT)
    constant(4, 0x58464231)  # "XFB1" in MEM2 proves guest reached configuration
    emit(d(36, 4, 3, 0))
    end = BASE + len(code) * 4
    emit(0x48000000)  # b . (emulated VI keeps advancing via core timing)
    emit(0x7c13fba6)  # unreachable HID4 instruction identifies Wii DOL to Dolphin
    return b''.join(struct.pack('>I', word) for word in code), end

def build():
    OUT.mkdir(parents=True, exist_ok=True)
    code, end = program()
    # Neutral chroma, two identical luma samples per YUYV pair. Eight vertical bars.
    row = b''.join(bytes([value, 128, value, 128]) * (WIDTH // 8 // 2) for value in LUMA)
    pixels = row * HEIGHT
    data_offset = (0x100 + len(code) + 31) & ~31
    header = [0] * 64
    header[0], header[7] = 0x100, data_offset
    header[18], header[25] = BASE, XFB
    header[36], header[43] = len(code), len(pixels)
    header[56] = BASE
    dol = struct.pack('>64I', *header) + code
    dol = dol.ljust(data_offset, b'\0') + pixels
    (OUT / 'xfb-bars.dol').write_bytes(dol)
    expected = {
        'status': 'generated; real core execution not yet verified',
        'kind': 'Wii VI/XFB scanout; not a GX rasterization test',
        'source': 'scripts/av-build-xfb-test.py (original code)',
        'sha256': hashlib.sha256(dol).hexdigest(), 'bytes': len(dol),
        'width': WIDTH, 'height': HEIGHT, 'xfb_address': XFB,
        'result_address': RESULT, 'guest_marker': 0x58464231, 'end_loop_pc': end,
        'yuyv_luma': LUMA, 'chroma_u': 128, 'chroma_v': 128,
        'expected_rgb_gray_approx': [0, 37, 75, 112, 149, 186, 224, 255],
        'rgb_tolerance': 4, 'alpha': 255,
        'sample_positions': 'center of each of eight equal-width vertical bars at half image height',
        'presentation': '320x240 at scale=1; 160x120 at default scale=0.5',
        'evidence_gate': 'guest marker + actual native frame generation + independent pixel comparison',
    }
    (OUT / 'expected.json').write_text(json.dumps(expected, indent=2) + '\n')
    print(json.dumps(expected, indent=2))

if __name__ == '__main__': build()
