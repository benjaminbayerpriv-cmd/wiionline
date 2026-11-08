import type { CoreCreateOptions, CoreEvent, EmulatorCore, InputState } from './protocol';
import { loadSystemFonts } from './system-fonts';
import { mountRvz, supportsDiscFiles } from './disc-file';
import { createAudioBridge } from './native-audio';
import { neutralInput, wiimoteArguments } from './wiimote-input';
import { createFrameBridge } from '../graphics/bridge/frame-bridge.mjs';

export interface DolphinModule {
  ccall(name: string, result: 'number' | 'string' | null, types: string[], values: unknown[]): unknown;
  FS: { writeFile(path: string, bytes: Uint8Array): void; unlink(path: string): void; mkdirTree?(path: string): void; mkdir?(path: string): void; rmdir?(path: string): void; mount?(type: unknown, options: unknown, path: string): unknown; unmount?(path: string): void };
  [name: string]: unknown;
}
const revision = 'e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1';
const required = ['WiiOnline_AbiVersion', 'CoreInit', 'SetVideoBackend', 'SetCpuCore', 'SetCpuThread', 'BootDisc', 'StopCore', 'SetCorePaused', 'PumpHostJobs', 'GetCoreStatus', 'GetCoreStateName'];
const maxHomebrewBytes = 64 * 1024 * 1024;

/** Bridge to the published core ABI. No metadata framebuffer or synthetic FPS. */
export class DolphinAdapter implements EmulatorCore {
  info = { name: 'Dolphin WASM / Cached Interpreter', revision, formats: ['dol', 'elf'],
    capabilities: { wiiInput: false, video: false, audio: false } };
  private path?: string;
  private releaseFile?: () => void;
  private booted = false;
  private timer?: ReturnType<typeof setInterval>;
  private lastStatus = '';
  private frameBridge?: ReturnType<typeof createFrameBridge>;
  private frameAtBoot = 0;
  private lastDeliveredGeneration = 0;
  private frameTimer?: ReturnType<typeof setInterval>;
  private audioBridge?: ReturnType<typeof createAudioBridge>;
  private audioClock = 0;
  private oglProbeTimer?: ReturnType<typeof setInterval>;
  constructor(private module: DolphinModule, private emit: (event: CoreEvent) => void,
              private videoBackend: 'software' | 'ogl' = 'software') {
    for (const name of required) {
      if (typeof module[`_${name}`] !== 'function') throw new Error(`Im WASM-Kern fehlt der Export ${name}.`);
    }
    if (this.number('WiiOnline_AbiVersion') !== 1) throw new Error('Nicht unterstützte Wii-Online-Kern-ABI.');
    this.requireOne('SetVideoBackend', ['string'], [videoBackend === 'ogl' ? 'OGL' : 'Software Renderer']);
    this.requireOne('SetCpuCore', ['string'], ['cached']);
    if (typeof module._SetPpcWasmJitEnabled === 'function') {
      module.ccall('SetPpcWasmJitEnabled', null, ['number'], [1]);
      this.info.name = 'Dolphin WASM / Cached + WASM-JIT';
    }
    if (videoBackend === 'ogl') this.info.name = 'Dolphin WASM / OGL Readback (experiment)';
    this.requireOne('SetCpuThread', ['number'], [1]);
    this.requireOne('CoreInit');
    if (supportsDiscFiles(module)) this.info.formats.push('rvz');
    this.audioBridge = createAudioBridge(module);
    if (this.audioBridge) {
      this.requireOne('SetAudioMuted', ['number'], [0]);
      this.info.capabilities.audio = true;
    }
    this.info.capabilities.wiiInput = typeof module._WiiOnline_SetWiimote === 'function' && typeof module._WiiOnline_ClearWiimote === 'function';
    if (module.HEAPU8 instanceof Uint8Array && ['FrameWidth', 'FrameHeight', 'FrameBuffer', 'GetFrame'].every(name => typeof module[`_${name}`] === 'function')) {
      this.frameBridge = createFrameBridge(module);
      this.info.capabilities.video = true;
    }
    this.emit({ type: 'log', message: `Native Kern-ABI 1 initialisiert. Experimentelle ${videoBackend === 'ogl' ? 'OGL-Readback-Bildausgabe' : 'Software-Bildausgabe'}; Wii-Input-Exporte ${this.info.capabilities.wiiInput ? 'verfügbar (Gastnachweis separat erforderlich)' : 'fehlen noch'}; PCM-Brücke ${this.info.capabilities.audio ? 'verfügbar (hörbarer Gastton noch separat zu prüfen)' : 'nicht verfügbar'}.` });
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
  }
  /** Eigener, leichter Takt nur fuer Bilder: liefert ein Bild, sobald der Kern eine neue Generation veroeffentlicht hat.
   * Getrennt vom schweren Pump-Takt (Host-Jobs, Status, Audio), damit die Anzeige nicht an dessen Dauer haengt. */
  private deliverFrame() {
    if (!this.booted || !this.frameBridge) return;
    const generation = this.number('GetFrame') >>> 0;
    // We never call RunFrame: only a positive native XFB/GL publication may display.
    // Skip the initial metadata image and the previous title's unchanged frame.
    if (generation > 0 && generation !== this.frameAtBoot && generation !== this.lastDeliveredGeneration) {
      const frame = this.frameBridge.read();
      if (frame) { this.lastDeliveredGeneration = generation; this.emit({ ...frame, type: 'frame' }); }
    }
  }
  async load(file: File) {
    if (file.size === 0) throw new Error('Die Datei ist leer.');
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!this.info.formats.includes(extension)) throw new Error(`Unterstützte Formate: ${this.info.formats.join(', ')}.`);
    if (extension !== 'rvz' && file.size > maxHomebrewBytes) throw new Error('Homebrew-Dateien sind auf 64 MiB begrenzt; RVZ wird stückweise gelesen.');
    if (this.booted) throw new Error('Vor einem Dateiwechsel den Kern stoppen.');
    this.releasePreparedFile();
    if (extension === 'rvz') {
      const mounted = await mountRvz(this.module, file);
      this.path = mounted.path;
      this.releaseFile = mounted.release;
      this.emit({ type: 'log', message: 'RVZ lokal zum stückweisen Lesen eingebunden. Boot und Spielkompatibilität werden erst beim Start geprüft.' });
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `/wiionline-homebrew.${extension}`;
    this.module.FS.writeFile(path, bytes);
    this.path = path;
    this.releaseFile = () => this.module.FS.unlink(path);
  }
  private releasePreparedFile() {
    if (this.releaseFile) this.releaseFile();
    this.releaseFile = undefined;
    this.path = undefined;
  }
  async start() {
    if (this.booted) { this.requireOne('SetCorePaused', ['number'], [0]); this.startPump(); return; }
    if (!this.path) throw new Error('Keine Homebrew-Datei vorbereitet.');
    this.input(neutralInput());
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
    this.audioClock = performance.now();
    if (this.videoBackend === 'ogl') this.startOglProbe();
    this.timer = setInterval(() => {
      try {
        this.pump();
        const state = this.text('GetCoreStateName');
        if (state === 'Uninitialized' || state === 'Stopping') throw new Error(`Der native Kern wurde beendet: ${this.text('GetCoreStatus')}`);
        const now = performance.now();
        if (state === 'Running' && this.audioBridge) {
          const audio = this.audioBridge.read(now - this.audioClock);
          if (audio) this.emit(audio);
        }
        this.audioClock = now;

      }
      catch (error) {
        this.clearPump();
        this.emit({ type: 'error', code: 'NATIVE_PUMP_FAILURE', message: String(error) });
      }
    }, 20);
    if (!this.frameTimer) this.frameTimer = setInterval(() => { try { this.deliverFrame(); } catch { /* der Pump-Takt meldet Kernfehler */ } }, 4);
  }
  private clearPump() {
    if (this.timer) clearInterval(this.timer); this.timer = undefined;
    if (this.frameTimer) clearInterval(this.frameTimer); this.frameTimer = undefined;
    if (this.oglProbeTimer) clearInterval(this.oglProbeTimer); this.oglProbeTimer = undefined;
  }
  private startOglProbe() {
    const names = ['GetCoreTicksHigh', 'GetCoreTicksLow', 'GetCoreTicksPerSecond'];
    if (!names.every(name => typeof this.module[`_${name}`] === 'function')) {
      this.emit({ type: 'log', message: 'OGL-Probe: Gastzeit-Exporte fehlen; Spielzeit-Rate nicht messbar.' });
      return;
    }
    const ticks = () => (BigInt(this.number('GetCoreTicksHigh') >>> 0) << 32n) | BigInt(this.number('GetCoreTicksLow') >>> 0);
    let previousAt = performance.now();
    let previousTicks = ticks();
    let previousVi = this.number('GetFrame') >>> 0;
    this.oglProbeTimer = setInterval(() => {
      const now = performance.now();
      const currentTicks = ticks();
      const currentVi = this.number('GetFrame') >>> 0;
      const guestSeconds = Number(currentTicks - previousTicks) / this.number('GetCoreTicksPerSecond');
      const wallSeconds = (now - previousAt) / 1000;
      const stats = typeof this.module._GetVideoStats === 'function' ? this.text('GetVideoStats') : 'GetVideoStats-Export fehlt';
      this.emit({ type: 'log', message: `OGL-Probe: Gastzeit/Wandzeit=${(guestSeconds / wallSeconds).toFixed(3)}x; VI-Generationen delta=${(currentVi - previousVi) >>> 0} (kein FPS-Maß); Wiimote=${this.readWiimoteDebug()}; Native VideoStats: ${stats.slice(0, 600)}` });
      previousAt = now;
      previousTicks = currentTicks;
      previousVi = currentVi;
    }, 5000);
  }
  private readWiimoteDebug() {
    const heap = this.module.HEAPU8;
    if (typeof this.module._WiiOnline_GetWiimoteDebug !== 'function' ||
        typeof this.module._malloc !== 'function' || typeof this.module._free !== 'function' ||
        !(heap instanceof Uint8Array)) return 'debug export unavailable';
    const ptr = Number((this.module._malloc as (size: number) => number)(64));
    if (!ptr || !Number.isInteger(ptr) || ptr % 4 !== 0 || ptr + 64 > heap.byteLength) return 'debug allocation failed';
    try {
      const count = this.number('WiiOnline_GetWiimoteDebug', ['number', 'number'], [0, ptr]);
      // Emscripten only guarantees HEAPU8 in this module. Read the native
      // 16-word snapshot directly from its buffer instead of requiring HEAPU32.
      const words = new Uint32Array(heap.buffer, heap.byteOffset + ptr, 16);
      return `n=${count} active=${words[0]} gen=${words[1]} build=${words[2]} hex=0x${words[3].toString(16)} mask=0x${words[15].toString(16)}`;
    } finally { (this.module._free as (ptr: number) => void)(ptr); }
  }
  async pause() {
    this.input(neutralInput());
    this.requireOne('SetCorePaused', ['number'], [1]);
    this.clearPump();
  }
  async stop() {
    this.clearPump();
    if (this.info.capabilities.wiiInput) this.module.ccall('WiiOnline_ClearWiimote', null, ['number'], [0]);
    if (this.booted) this.module.ccall('StopCore', null, [], []);
    this.booted = false;
    this.releasePreparedFile();
  }
  input(input: InputState) {
    if (!this.info.capabilities.wiiInput) return;
    const args = wiimoteArguments(input);
    this.module.ccall('WiiOnline_SetWiimote', null, Array(8).fill('number'), args);
    if (this.videoBackend === 'ogl') this.emit({ type: 'log', message: `OGL-Eingabe: UI-Maske=0x${args[1].toString(16)}; Wiimote=${this.readWiimoteDebug()}` });
  }
}

export async function createCore(emit: (event: CoreEvent) => void, options: CoreCreateOptions = {}): Promise<EmulatorCore> {
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
  const videoBackend = options.videoBackend === 'ogl' ? 'ogl' : 'software';
  let canvas: OffscreenCanvas | undefined;
  if (videoBackend === 'ogl') {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('OGL-Test benötigt OffscreenCanvas in diesem Worker.');
    canvas = new OffscreenCanvas(640, 528);
  }
  const module = await native.default({
    locateFile: (name: string) => `/core/${name}`,
    ...(canvas ? { canvas, dolphinOglReadbackPresent: true, dolphinOglWorkerWebGl: true } : {}),
    print: (message: string) => emit({ type: 'log', message }),
    printErr: (message: string) => emit({ type: 'log', message }),
    onAbort: (reason: unknown) => emit({ type: 'error', code: 'NATIVE_ABORT', message: `WASM-Abbruch: ${String(reason)}` }),
  });
  await loadSystemFonts(module);
  return new DolphinAdapter(module, emit, videoBackend);
}

export { loadSystemFonts } from './system-fonts';
export { bindBrowserInput, imagePointer } from './browser-input';
