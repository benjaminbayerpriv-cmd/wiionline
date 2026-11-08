#!/usr/bin/env bash
# Reproduzierbarer Minimalbuild des Dolphin-Kerns nach WebAssembly (ohne Desktop-GUI).
# Aufruf: scripts/core-build.sh [toolchain|fetch|patch|configure|build|all]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE="$ROOT/native"
WORK="${WIIONLINE_WORK:-$ROOT/.core-work}"
# shellcheck disable=SC1091
source "$CORE/toolchain.lock"
SRC="$WORK/dolphin"; BLD="$WORK/build"; EMSDK_DIR="$WORK/emsdk"; OUT="${WIIONLINE_OUT:-$ROOT/dist-core}"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc)}"
mkdir -p "$WORK" "$OUT"

toolchain() {
  [ -d "$EMSDK_DIR/.git" ] || git clone "$EMSDK_REPO" "$EMSDK_DIR"
  git -C "$EMSDK_DIR" checkout -q "$EMSDK_COMMIT"
  ( cd "$EMSDK_DIR" && ./emsdk install "$EMSCRIPTEN_VERSION" && ./emsdk activate "$EMSCRIPTEN_VERSION" )
}
use_emsdk() {
  # shellcheck disable=SC1091
  source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
  local v; v="$(emcc --version | head -1)"
  case "$v" in *"$EMSCRIPTEN_VERSION"*"$EMSCRIPTEN_COMPILER_COMMIT"*) ;; *) echo "Toolchain-Abweichung: $v" >&2; exit 1;; esac
}
fetch_ext() { # dir url commit
  mkdir -p "$1"; ( cd "$1"
    [ -d .git ] || { git init -q .; git remote add origin "$2"; }
    git cat-file -e "$3^{commit}" 2>/dev/null || git fetch --depth 1 origin "$3"
    git checkout -q -f "$3"; [ "$(git rev-parse HEAD)" = "$3" ] ); }
fetch() {
  mkdir -p "$SRC"; cd "$SRC"
  [ -d .git ] || { git init -q .; git remote add origin "$DOLPHIN_REPO"; }
  git cat-file -e "$DOLPHIN_COMMIT^{commit}" 2>/dev/null || git fetch --depth 1 origin "$DOLPHIN_COMMIT"
  git checkout -q -f "$DOLPHIN_COMMIT"
  [ "$(git rev-parse HEAD)" = "$DOLPHIN_COMMIT" ]
  # shellcheck disable=SC2086
  git submodule update --init --depth 1 --jobs 8 $SUBMODULES
  # glslang erwartet SPIRV-Tools/-Headers unter External/ (update_glslang_sources.py), auf Commits gepinnt
  fetch_ext "$SRC/Externals/glslang/glslang/External/spirv-tools" https://github.com/KhronosGroup/SPIRV-Tools.git "$SPIRV_TOOLS_COMMIT"
  fetch_ext "$SRC/Externals/glslang/glslang/External/spirv-tools/external/spirv-headers" https://github.com/KhronosGroup/SPIRV-Headers.git "$SPIRV_HEADERS_COMMIT"
}
patch_tree() {
  cd "$SRC"
  git reset -q --hard "$DOLPHIN_COMMIT"; git clean -fdxq -e Externals
  git submodule foreach -q 'git reset -q --hard; git clean -fdxq'
  for p in $(ls "$CORE"/patches/*.patch | sort); do git apply --whitespace=nowarn "$p"; done
  git -C Externals/SFML/SFML apply --whitespace=nowarn "$CORE"/patches/submodules/0001-sfml-emscripten-config.patch
  git -C Externals/xxhash/xxHash apply --whitespace=nowarn "$CORE"/patches/submodules/0002-xxhash-wasm-simd-scalar.patch
  echo "Patches angewendet: $(ls "$CORE"/patches/*.patch | wc -l | tr -d ' ') + 2 Submodule"
}
configure() {
  use_emsdk
  mkdir -p "$WORK/stubs"
  emcc -O2 -pthread -c "$CORE/stubs/naga_stub.c" -o "$WORK/stubs/naga_stub.o"
  emar rcs "$WORK/stubs/libnaga_stub.a" "$WORK/stubs/naga_stub.o"
  local FLAGS="-O3 -pthread -msimd128 -flto -DXXH_VECTOR=0 -DDOLPHIN_WEB_HOT_COUNTERS=0 -DDOLPHIN_WEB_INLINE_FAST_BRANCH=1 -DDOLPHIN_WEB_FALLBACK_MAP_DIAGNOSTICS=0 -DDOLPHIN_WEB_FALLBACK_MAP_BITS=16 -DDOLPHIN_WEB_DIRECT_WASM_BLOCK_DISPATCH=0"
  emcmake cmake -S "$SRC" -B "$BLD" -GNinja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TRY_COMPILE_CONFIGURATION=Debug \
    -DUSE_SYSTEM_LIBS=OFF -DENABLE_GENERIC=ON -DENABLE_QT=OFF -DENABLE_NOGUI=OFF -DENABLE_CLI_TOOL=OFF -DENABLE_HEADLESS=OFF \
    -DENABLE_ALSA=OFF -DENABLE_PULSEAUDIO=OFF -DENABLE_CUBEB=OFF -DENABLE_X11=OFF -DENABLE_EGL=OFF -DENABLE_SDL=OFF -DENABLE_VULKAN=OFF \
    -DENABLE_LLVM=OFF -DENABLE_TESTS=OFF -DUSE_UPNP=OFF -DUSE_DISCORD_PRESENCE=OFF -DUSE_MGBA=OFF -DUSE_RETRO_ACHIEVEMENTS=OFF \
    -DENABLE_AUTOUPDATE=OFF -DENABLE_ANALYTICS=OFF -DENCODE_FRAMEDUMPS=OFF -DWITH_OPTIM=OFF -DWITH_SSE2=OFF -DWITH_SSSE3=OFF \
    -DWITH_SSE41=OFF -DWITH_SSE42=OFF -DWITH_PCLMULQDQ=OFF -DWITH_AVX2=OFF -DWITH_AVX512=OFF -DWITH_AVX512VNNI=OFF -DWITH_VPCLMULQDQ=OFF \
    "-DCMAKE_C_FLAGS:STRING=$FLAGS" "-DCMAKE_CXX_FLAGS:STRING=$FLAGS" \
    "-DCMAKE_C_FLAGS_DEBUG:STRING=-O0 -fno-lto" "-DCMAKE_CXX_FLAGS_DEBUG:STRING=-O0 -fno-lto" \
    -DDOLPHIN_WASM_NAGA_WGSL_LIB="$WORK/stubs/libnaga_stub.a" \
    -DDOLPHIN_WASM_JIT_CACHE_PRE_JS="$CORE/src/jit-cache-prejs.js" \
    -DDOLPHIN_WASM_MEMORY_PAGES="$WASM_MEMORY_PAGES" \
    -DDOLPHIN_WASM_PROJECT_ROOT="$CORE" \
    -DDOLPHIN_WASM_BRIDGE_SOURCE="$CORE/src/dolphin_web_discio.cpp" -DDOLPHIN_WASM_SHARED_SOURCE_DIR="$CORE/src" \
    -DDOLPHIN_WASM_CORE_SOURCE="$CORE/src/dolphin_web_core.cpp" -DDOLPHIN_WASM_OUTPUT_DIR="$OUT"
}
build() {
  use_emsdk
  cmake --build "$BLD" --target dolphin_web_core -j "$JOBS"
  ( cd "$OUT" && shasum -a 256 dolphin-core-upstream.* | tee SHA256SUMS )
}
case "${1:-all}" in
  toolchain) toolchain;; fetch) fetch;; patch) patch_tree;; configure) configure;; build) build;;
  all) [ -x "$EMSDK_DIR/emsdk" ] || toolchain; fetch; patch_tree; configure; build;;
  *) echo "unbekannt: $1" >&2; exit 2;;
esac
