import type { Command, CoreEvent, CreateCore, EmulatorCore, EmulatorState } from './protocol';
import { validateFile } from './validation';

/** Serialized lifecycle independent of Worker globals so transitions can be tested. */
export class Runtime {
  private core?: EmulatorCore;
  private state: EmulatorState = 'idle';
  private queue: Promise<void> = Promise.resolve();
  private failureVersion = 0;
  constructor(private factory: () => Promise<CreateCore>, private emit: (event: CoreEvent) => void) {}
  dispatch(command: Command): Promise<void> {
    if (command.type === 'input') {
      if (this.state === 'running') {
        try { this.core?.input(command.input); }
        catch (error) { this.fail(error); }
      }
      return Promise.resolve();
    }
    this.queue = this.queue.then(() => this.execute(command)).catch(error => this.fail(error));
    return this.queue;
  }
  private status(state: EmulatorState, message: string) {
    this.state = state;
    this.emit({ type: 'status', state, message, core: this.core?.info });
  }
  private fail(error: unknown) {
    this.failureVersion++;
    this.state = 'error';
    this.emit({ type: 'error', code: 'CORE_FAILURE', message: error instanceof Error ? error.message : String(error) });
  }
  private async perform(action: () => Promise<void>) {
    const version = this.failureVersion;
    await action();
    return version === this.failureVersion;
  }
  private async execute(command: Exclude<Command, { type: 'input' }>) {
    if (command.type === 'init') {
      if (this.core) throw new Error('Der Kern ist bereits initialisiert. Zum Neustart die Seite neu laden.');
      this.status('loading', 'Emulator-Kern wird geladen …');
      const createCore = await this.factory();
      const version = this.failureVersion;
      const core = await createCore(event => {
        // Lifecycle states belong to this wrapper; native cores emit logs, frames, audio and metrics.
        if (event.type === 'status') return;
        if (event.type === 'error') { this.state = 'error'; this.failureVersion++; }
        this.emit(event);
      });
      if (!core?.info?.name || !Array.isArray(core.info.formats) ||
          !['load', 'start', 'pause', 'stop', 'input'].every(key => typeof core[key as keyof EmulatorCore] === 'function')) {
        throw new Error('Der Adapter entspricht nicht dem vereinbarten Kern-Vertrag.');
      }
      this.core = core;
      if (version !== this.failureVersion) return;
      this.status('idle', 'Kern geladen. Eine unterstützte Datei auswählen.');
      return;
    }
    if (!this.core) throw new Error('Kein Emulator-Kern geladen.');
    if (command.type === 'load') {
      if (this.state !== 'idle' && this.state !== 'ready') throw new Error('Vor dem Dateiwechsel die Emulation stoppen.');
      const problem = validateFile(command.file, this.core.info);
      if (problem) {
        this.emit({ type: 'log', message: problem });
        return;
      }
      // Unload an already prepared title before replacing it.
      if (this.state === 'ready' && !await this.perform(() => this.core!.stop())) return;
      this.status('loading', 'Datei wird vorbereitet …');
      if (!await this.perform(() => this.core!.load(command.file))) return;
      this.status('ready', `${command.file.name} ist bereit.`);
    } else if (command.type === 'start') {
      if (this.state !== 'ready' && this.state !== 'paused') throw new Error('Zuerst eine Datei laden.');
      if (!await this.perform(() => this.core!.start())) return;
      this.status('running', 'Emulation läuft.');
    } else if (command.type === 'pause') {
      if (this.state !== 'running') return;
      if (!await this.perform(() => this.core!.pause())) return;
      this.status('paused', 'Emulation pausiert.');
    } else if (command.type === 'stop') {
      if (!await this.perform(() => this.core!.stop())) return;
      this.status('idle', 'Gestoppt. Eine Datei auswählen.');
    }
  }
}
