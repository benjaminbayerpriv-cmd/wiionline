#!/usr/bin/env bash
# Baut das eigene WPAD-Testprogramm (native/test/wpad/wpad_test.c) im auf Digest gepinnten devkitPro-Image.
# Ergebnis: native/test/wpad/wpad_test.dol + wpad_test.json (Symboladresse g_wpad_result, DOL-Hash).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="devkitpro/devkitppc@sha256:04bab308c032848c1ca5a09c02b4aaa4d505efd7996aab05b9a4eb15231b2868"
cd "$ROOT/native/test/wpad"
docker run --rm -v "$PWD":/src -w /src "$IMAGE" sh -c '
  set -e
  export PATH=/opt/devkitpro/devkitPPC/bin:/opt/devkitpro/tools/bin:$PATH
  powerpc-eabi-gcc -O2 -Wall -mrvl -mcpu=750 -meabi -mhard-float -DGEKKO \
    -I/opt/devkitpro/libogc/include wpad_test.c -o wpad_test.elf \
    -L/opt/devkitpro/libogc/lib/wii -lwiiuse -lbte -logc -lm -Wl,-Map,wpad_test.map
  elf2dol wpad_test.elf wpad_test.dol
  powerpc-eabi-nm wpad_test.elf | grep -E " g_wpad_result$" > wpad_test.sym
'
ADDR="0x$(awk '{print $1}' wpad_test.sym)"
SHA="$(shasum -a 256 wpad_test.dol | awk '{print $1}')"
printf '{\n "image": "%s",\n "result_symbol": "g_wpad_result",\n "result_addr": %s,\n "dol_sha256": "%s"\n}\n' "$IMAGE" "$((ADDR))" "$SHA" > wpad_test.json
cat wpad_test.json; ls -l wpad_test.dol; rm -f wpad_test.sym
