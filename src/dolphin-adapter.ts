import type { CoreEvent, EmulatorCore, InputState } from './protocol';
import { createFrameBridge } from '../graphics/bridge/frame-bridge.mjs';

export interface DolphinModule {
  ccall(name: string, result: 'number' | 'string' | null, types: string[], values: unknown[]): unknown;
  FS: { writeFile(path: string, bytes: Uint8Array): void; unlink(path: string): void };
  [name: string]: unknown;
}
const revision = 'e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1';
const required = ['WiiOnline_AbiVersion', 'CoreInit', 'SetVideoBackend', 'SetCpuCore', 'SetCpuThread', 'BootDisc', 'StopCore', 'SetCorePaused', 'PumpHostJobs', 'GetCoreStatus', 'GetCoreStateName'];
const maxHomebrewBytes = 64 * 1024 * 1024;

/** Bridge to the published core ABI. No metadata framebuffer or synthetic FPS. */
export class DolphinAdapter implements EmulatorCore {
  info = { name: 'Dolphin WASM / CPU bring-up', revision, formats: ['dol', 'elf'],
    capabilities: { wiiInput: false, video: false, audio: false } };
  private path?: string;
  private booted = false;
  private timer?: ReturnType<typeof setInterval>;
  private lastStatus = '';
  private frameBridge?: ReturnType<typeof createFrameBridge>;
  private frameAtBoot = 0;
  constructor(private module: DolphinModule, private emit: (event: CoreEvent) => void) {
    for (const name of required) {
      if (typeof module[`_${name}`] !== 'function') throw new Error(`Im WASM-Kern fehlt der Export ${name}.`);
    }
    if (this.number('WiiOnline_AbiVersion') !== 1) throw new Error('Nicht unterstützte Wii-Online-Kern-ABI.');
    this.requireOne('SetVideoBackend', ['string'], ['Software Renderer']);
    this.requireOne('SetCpuCore', ['string'], ['interpreter']);
    this.requireOne('SetCpuThread', ['number'], [1]);
    this.requireOne('CoreInit');
    if (module.HEAPU8 instanceof Uint8Array && ['FrameWidth', 'FrameHeight', 'FrameBuffer', 'GetFrame'].every(name => typeof module[`_${name}`] === 'function')) {
      this.frameBridge = createFrameBridge(module);
      this.info.capabilities.video = true;
    }
    this.emit({ type: 'log', message: 'Native Kern-ABI 1 initialisiert. Experimentelle Software-Bildausgabe; Wii-Eingaben und Audio sind noch nicht verbunden.' });
  }
  private number(name: string, types: string[] = [], values: unknown[] = []) {
    return Number(this.module.ccall(name, 'number', types, values));
  }
  private text(name: string) { return String(this.module.ccall(name, 'string', [], [])); }
  private requireOne(name: string, types: string[] = [], values: unknown[] = []) {
    if (this.number(name, types, values) !== 1) throw new Error(`${name} ist fehlgeschlagen.`);
  }
  private pump() {
    this.module.ccall('PumpHostJobs', null, [], []);
    const status = this.text('GetCoreStatus');
    if (status !== this.lastStatus) { this.lastStatus = status; this.emit({ type: 'log', message: status }); }
    if (this.booted && this.frameBridge) {
      const generation = this.number('GetFrame') >>> 0;
      // We never call RunFrame: only a positive native XFB/GL publication may display.
      // Skip the initial metadata image and the previous title's unchanged frame.
      if (generation > 0 && generation !== this.frameAtBoot) {
        const frame = this.frameBridge.read();
        if (frame) this.emit({ ...frame, type: 'frame' });
      }
    }
  }
  async load(file: File) {
    if (file.size === 0 || file.size > maxHomebrewBytes) throw new Error('Der erste Kern unterstützt kleine Homebrew-Dateien bis 64 MiB.');
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'dol' && extension !== 'elf') throw new Error('Dieser Integrationsstand unterstützt nur DOL und ELF.');
    if (this.booted) throw new Error('Vor einem Dateiwechsel den Kern stoppen.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (this.path) { this.module.FS.unlink(this.path); this.path = undefined; }
    const path = `/wiionline-homebrew.${extension}`;
    this.module.FS.writeFile(path, bytes);
    this.path = path;
  }
  async start() {
    if (this.booted) { this.requireOne('SetCorePaused', ['number'], [0]); this.startPump(); return; }
    if (!this.path) throw new Error('Keine Homebrew-Datei vorbereitet.');
    this.frameAtBoot = this.frameBridge ? this.number('GetFrame') >>> 0 : 0;
    if (this.frameBridge) this.frameBridge.stats.lastFrame = this.frameAtBoot;
    this.requireOne('BootDisc', ['string'], [this.path]);
    // BootDisc submits boot asynchronously; submission alone is not a running CPU.
    this.booted = true;
    try {
      const deadline = performance.now() + 20000;
      while (performance.now() < deadline) {
        this.pump();
        const state = this.text('GetCoreStateName');
        if (state === 'Running') { this.startPump(); return; }
        if (state === 'Stopping') throw new Error(`Boot abgebrochen: ${this.text('GetCoreStatus')}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Der Kern erreicht den Laufzustand nicht: ${this.text('GetCoreStatus')}`);
    } catch (error) { await this.stop(); throw error; }
  }
  private startPump() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.pump();
        const state = this.text('GetCoreStateName');
        if (state === 'Uninitialized' || state === 'Stopping') throw new Error(`Der native Kern wurde beendet: ${this.text('GetCoreStatus')}`);
      }
      catch (error) {
        this.clearPump();
        this.emit({ type: 'error', code: 'NATIVE_PUMP_FAILURE', message: String(error) });
      }
    }, 20);
  }
  private clearPump() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async pause() {
    this.requireOne('SetCorePaused', ['number'], [1]);
    this.clearPump();
  }
  async stop() {
    this.clearPump();
    if (this.booted) this.module.ccall('StopCore', null, [], []);
    this.booted = false;
    if (this.path) { this.module.FS.unlink(this.path); this.path = undefined; }
  }
  input(_input: InputState) {
    // SetInputState in this native revision is GameCube-only. Do not map Wii keys to it.
  }
}

export async function createCore(emit: (event: CoreEvent) => void): Promise<EmulatorCore> {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error('Der Kern benötigt geteilten Speicher. Der Webserver muss COOP/COEP korrekt setzen.');
  }
  const path = '/core/dolphin-core-upstream.js';
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Die nativen Wii-Kern-Dateien fehlen noch. Der fertige Kern muss zuerst vom Projekt eingebunden werden.');
  }
  const native = await import(/* @vite-ignore */ path) as {
    default: (options: Record<string, unknown>) => Promise<DolphinModule>;
  };
  if (typeof native.default !== 'function') throw new Error('Die native Emscripten-Modulfabrik fehlt.');
  const module = await native.default({
    locateFile: (name: string) => `/core/${name}`,
    print: (message: string) => emit({ type: 'log', message }),
    printErr: (message: string) => emit({ type: 'log', message }),
    onAbort: (reason: unknown) => emit({ type: 'error', code: 'NATIVE_ABORT', message: `WASM-Abbruch: ${String(reason)}` }),
  });
  return new DolphinAdapter(module, emit);
}
