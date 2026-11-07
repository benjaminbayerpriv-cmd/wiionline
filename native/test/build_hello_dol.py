#!/usr/bin/env python3
"""Erzeugt hello_wii.dol, ein eigenes, minimales Wii-Homebrew-Testprogramm (PowerPC, big-endian).

Herkunft: komplett selbst geschrieben (kein devkitPro/libogc, keine fremden Binaerdaten).
Der Maschinencode wird mit einem winzigen Encoder erzeugt (nur die benoetigten Befehle),
damit der Build ohne PowerPC-Cross-Compiler reproduzierbar ist.

Programm (Eintritt 0x80004000):
  1. schreibt Magic "WIIONLIN" nach 0x90100000 (MEM2 -> beweist Wii-Speicherkarte)
  2. Summe 1..1000 (=500500=0x0007A314) nach 0x90100008
  3. 10000 Schritte LCG x=x*1664525+1013904223 (mod 2^32), Start x=1, nach 0x9010000C
  4. Marker "DONE" (0x444F4E45) nach 0x90100010, danach Endlosschleife
  Hinter der Schleife steht ein nie ausgefuehrtes 'mtspr HID4,r0' (0x7C13FBA6): Dolphin
  erkennt DOLs mit diesem Muster als Wii-Programme (DolReader::m_is_wii).
Aufruf: build_hello_dol.py hello_wii.dol   (gibt expected.json auf stdout aus)
"""
import hashlib, json, struct, sys

BASE = 0x80004000
RES = 0x90100000

def D(op, rt, ra, imm): return (op << 26) | (rt << 21) | (ra << 16) | (imm & 0xFFFF)
def lis(r, i): return D(15, r, 0, i)
def li(r, i): return D(14, r, 0, i)
def ori(ra, rs, i): return D(24, rs, ra, i)           # ori ra,rs,i
def addi(rt, ra, i): return D(14, rt, ra, i)
def stw(rs, off, ra): return D(36, rs, ra, off)
def X(rt, ra, rb, xo): return (31 << 26) | (rt << 21) | (ra << 16) | (rb << 11) | (xo << 1)
def add(rt, ra, rb): return X(rt, ra, rb, 266)
def mullw(rt, ra, rb): return X(rt, ra, rb, 235)
def mtctr(r): return (31 << 26) | (r << 21) | (9 << 16) | (467 << 1)   # mtspr 9 (CTR)
def bdnz(delta): return (16 << 26) | (16 << 21) | (delta & 0xFFFC)       # bc 16,0,delta (relativ, Bytes)
def b(delta): return (18 << 26) | (delta & 0x03FFFFFC)
HID4_MTSPR = 0x7C13FBA6                                                  # mtspr 1012,r0

code = []
def emit(w): code.append(w & 0xFFFFFFFF)
def here(): return len(code) * 4

emit(lis(3, RES >> 16))                  # r3 = 0x90100000
emit(lis(4, 0x5749)); emit(ori(4, 4, 0x494F)); emit(stw(4, 0, 3))   # "WIIO"
emit(lis(4, 0x4E4C)); emit(ori(4, 4, 0x494E)); emit(stw(4, 4, 3))   # "NLIN"
emit(li(5, 0)); emit(li(7, 0)); emit(li(6, 1000)); emit(mtctr(6))
loop1 = here()
emit(addi(7, 7, 1)); emit(add(5, 5, 7)); emit(bdnz(loop1 - here()))
emit(stw(5, 8, 3))
emit(lis(8, 0x0019)); emit(ori(8, 8, 0x660D))                       # 1664525
emit(lis(9, 0x3C6E)); emit(ori(9, 9, 0xF35F))                       # 1013904223
emit(li(10, 1)); emit(li(6, 10000)); emit(mtctr(6))
loop2 = here()
emit(mullw(10, 10, 8)); emit(add(10, 10, 9)); emit(bdnz(loop2 - here()))
emit(stw(10, 12, 3))
emit(lis(4, 0x444F)); emit(ori(4, 4, 0x4E45)); emit(stw(4, 16, 3))  # "DONE"
end = here()
emit(b(end - here()))                                               # b .
emit(HID4_MTSPR)                                                    # nie erreicht (Wii-Markierung)

text = b"".join(struct.pack(">I", w) for w in code)
data = b"\xEE" * 0x20                                               # Sentinel in MEM2

TEXT_OFF, DATA_OFF = 0x100, 0x100 + ((len(text) + 0x1F) & ~0x1F)
hdr = [0] * 64
hdr[0] = TEXT_OFF; hdr[7] = DATA_OFF                                 # Offsets: Text0, Data0
hdr[18] = BASE; hdr[25] = RES                                        # Adressen
hdr[36] = len(text); hdr[43] = len(data)                             # Groessen
hdr[56] = BASE                                                       # Entry
dol = struct.pack(">64I", *hdr)[:0x100]
dol += text.ljust(DATA_OFF - TEXT_OFF, b"\0") + data
open(sys.argv[1] if len(sys.argv) > 1 else "hello_wii.dol", "wb").write(dol)

s, x = 0, 1
for i in range(1, 1001): s += i
for _ in range(10000): x = (x * 1664525 + 1013904223) & 0xFFFFFFFF
exp = {"magic": "WIIONLIN", "sum": s, "lcg": x, "done": 0x444F4E45, "result_addr": RES,
       "entry": BASE, "end_loop_pc": BASE + end, "sha256": hashlib.sha256(dol).hexdigest()}
print(json.dumps(exp, indent=1))
