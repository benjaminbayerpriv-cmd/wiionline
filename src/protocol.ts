/** Shared browser/worker contract v1. Changes require coordination with both core agents. */
export type EmulatorState = 'idle' | 'loading' | 'ready' | 'running' | 'paused' | 'error';
export type Button = 'A' | 'B' | 'ONE' | 'TWO' | 'PLUS' | 'MINUS' | 'HOME' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type InputState = { buttons: Button[]; pointer: { x: number; y: number; visible: boolean } };
export type Command =
  | { type: 'init' }
  | { type: 'load'; file: File }
  | { type: 'start' | 'pause' | 'stop' }
  | { type: 'input'; input: InputState };
export type CoreInfo = { name: string; revision: string; formats: string[]; capabilities?: { wiiInput: boolean; video: boolean; audio: boolean } };
export type CoreEvent =
  | { type: 'status'; state: EmulatorState; message: string; core?: CoreInfo }
  | { type: 'log'; message: string }
  | { type: 'frame'; width: number; height: number; rgba: ArrayBuffer }
  | { type: 'audio'; sampleRate: number; channels: 2; pcm: ArrayBuffer }
  | { type: 'metrics'; fps: number; emulationSpeed: number }
  | { type: 'error'; code: string; message: string };
/** Adapter implemented by the native-core agent; imported within a dedicated worker. */
export interface EmulatorCore {
  info: CoreInfo;
  load(file: File): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  input(input: InputState): void;
}
export type CreateCore = (emit: (event: CoreEvent) => void) => Promise<EmulatorCore>;
