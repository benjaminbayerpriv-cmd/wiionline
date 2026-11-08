/* Stub fuer die Rust/Naga SPIR-V->WGSL-Bruecke des WebGPU-Pfads.
 * Der Kern-Minimalbuild enthaelt keinen WebGPU-Renderer (gehoert zum Grafik-Zweig);
 * die Symbole muessen nur linkbar sein. Aufrufe schlagen immer mit NULL fehl. */
#include <stddef.h>
#include <stdint.h>
const char* naga_last_error(void) { return "naga stub: WebGPU shader path not built into core-minimal"; }
char* naga_spirv_to_wgsl(const uint32_t* p, size_t n) { (void)p; (void)n; return NULL; }
void naga_free_wgsl(char* p) { (void)p; }
