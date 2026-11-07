import './style.css';
import type { Button, Command, CoreEvent, CoreInfo, EmulatorState } from './protocol';
import { validateFile } from './validation';
import { AudioOutput } from './audio';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<header><a class="brand" href="/">Wii <span>Online</span></a><span class="stage">Entwicklungsversion</span></header>
<main>
  <div class="intro"><h1>Deine Wii im Browser.</h1><p>Lokale Dateien öffnen und direkt auf diesem Computer ausführen.</p></div>
  <div class="console-layout">
    <section class="console" aria-label="Emulator">
      <div class="screen" id="screen"><canvas id="display" width="640" height="480" tabindex="0" aria-label="Spielbild und Tastatursteuerung"></canvas>
        <div class="empty" id="empty"><div class="disc" aria-hidden="true"></div><h2 id="screen-title">Kern wird geprüft</h2><p id="screen-copy">Die Verbindung zum Emulator wird vorbereitet.</p></div>
      </div>
      <div class="controls"><button id="start" disabled>Starten</button><button id="pause" disabled>Pause</button><button id="stop" disabled>Stoppen</button><button id="fullscreen" class="quiet">Vollbild</button></div>
      <p id="status" role="status" aria-live="polite">Emulator wird vorbereitet …</p>
    </section>
    <aside>
      <section class="file-panel"><h2>Software öffnen</h2><p>Wähle eine Datei von deinem Computer. Sie wird nicht hochgeladen.</p>
      <label class="file-button" id="file-label" aria-disabled="true">Datei auswählen<input id="file" type="file" disabled></label>
      <p id="filename">Noch keine Datei ausgewählt</p><p id="formats" class="detail">Formate werden vom Kern gemeldet.</p></section>
      <section><h2>Steuerung</h2><dl class="keys"><div><dt>A / B</dt><dd><kbd>X</kbd> <kbd>Z</kbd></dd></div><div><dt>Steuerkreuz</dt><dd>Pfeiltasten</dd></div><div><dt>1 / 2</dt><dd><kbd>1</kbd> <kbd>2</kbd></dd></div><div><dt>Plus / Minus</dt><dd><kbd>Enter</kbd> <kbd>−</kbd></dd></div><div><dt>Home</dt><dd><kbd>H</kbd></dd></div><div><dt>Zeiger</dt><dd>Maus im Spielbild</dd></div></dl><p class="detail">Zum Steuern zuerst ins Spielbild klicken. Bewegungssensoren werden noch nicht unterstützt.</p></section>
      <section><h2>Browser & Kern</h2><ul id="capabilities"></ul><p id="core-info" class="detail">Kein Kern verbunden</p><button id="retry" class="quiet">Kern erneut prüfen</button></section>
    </aside>
  </div>
  <details><summary>Diagnoseprotokoll</summary><pre id="log" aria-label="Diagnoseprotokoll"></pre></details>
  <footer>Experimentelle Wii-Emulation. Spielkompatibilität und Geschwindigkeit sind noch nicht bestätigt.</footer>
</main>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('display');
const context = canvas.getContext('2d');
const start = el<HTMLButtonElement>('start');
const pause = el<HTMLButtonElement>('pause');
const stop = el<HTMLButtonElement>('stop');
const file = el<HTMLInputElement>('file');
const retry = el<HTMLButtonElement>('retry');
const log = el<HTMLPreElement>('log');
const audio = new AudioOutput();
let worker: Worker | undefined;
let state: EmulatorState = 'idle';
let core: CoreInfo | undefined;
let pending = false;
let hasFrame = false;
const buttons = new Set<Button>();
let pointer = { x: 0.5, y: 0.5, visible: false };
function appendLog(message: string) { log.textContent = [...(log.textContent || '').split('\n'), message].slice(-150).join('\n'); }
function send(command: Command) { worker?.postMessage(command); }
function input() { send({ type: 'input', input: { buttons: [...buttons], pointer } }); }
function resetInput() { buttons.clear(); pointer = { ...pointer, visible: false }; input(); }
function refresh() {
  start.disabled = pending || !['ready', 'paused'].includes(state);
  start.textContent = state === 'paused' ? 'Fortsetzen' : 'Starten';
  pause.disabled = pending || state !== 'running';
  stop.disabled = pending || !core || !['ready', 'running', 'paused', 'error'].includes(state);
  file.disabled = pending || !core || !['idle', 'ready'].includes(state);
  el('file-label').setAttribute('aria-disabled', String(file.disabled));
  retry.disabled = pending || !!core;
  if (state === 'error') { el('screen-title').textContent = 'Emulator nicht bereit'; el('screen-copy').textContent = 'Details findest du in der Statusmeldung unter dem Spielbild.'; }
  else if (core && state === 'idle') { el('screen-title').textContent = 'Bereit für deine Datei'; el('screen-copy').textContent = 'Wähle rechts eine unterstützte Datei aus.'; }
  else if (state === 'ready') { el('screen-title').textContent = 'Datei geladen'; el('screen-copy').textContent = 'Mit Starten beginnt die Emulation.'; }
  else if (state === 'running' && !hasFrame) { el('screen-title').textContent = 'Warte auf das erste Bild'; el('screen-copy').textContent = 'Der Kern wurde gestartet. Es liegt noch kein Bild vor.'; }
}
function clearScreen() { hasFrame = false; context?.clearRect(0, 0, canvas.width, canvas.height); el('empty').hidden = false; }
function receive(event: CoreEvent) {
  if (event.type === 'status' || event.type === 'error') {
    pending = false;
    state = event.type === 'error' ? 'error' : event.state;
    if (event.type === 'status' && event.core) {
      core = event.core;
      el('core-info').textContent = `${core.name} (${core.revision})`;
      el('formats').textContent = `Unterstützt: ${core.formats.join(', ')}`;
      file.accept = core.formats.map(format => `.${format}`).join(',');
    }
    el('status').textContent = event.message;
    el('status').classList.toggle('error', event.type === 'error');
    appendLog(`${event.type}: ${event.message}`);
    if (['paused', 'idle', 'error'].includes(state)) { resetInput(); audio.clear(); }
    if (state === 'idle' || (state === 'loading' && core)) clearScreen();
    refresh();
  } else if (event.type === 'log') appendLog(event.message);
  else if (event.type === 'frame') {
    if (state !== 'running') return;
    const { width, height, rgba } = event;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || rgba.byteLength !== width * height * 4) { appendLog('Ungültiges Bildformat vom Kern.'); return; }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context?.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    hasFrame = true;
    el('empty').hidden = true;
  } else if (event.type === 'audio' && state === 'running') audio.play(event.pcm, event.sampleRate);
  else if (event.type === 'metrics' && state === 'running') el('status').textContent = `Emulation läuft: ${event.fps.toFixed(1)} FPS, ${(event.emulationSpeed * 100).toFixed(0)} % Geschwindigkeit`;
}
function initialize() {
  if (!('Worker' in window) || !('WebAssembly' in window)) { receive({ type: 'error', code: 'BROWSER_UNSUPPORTED', message: 'Dieser Browser unterstützt die benötigten Worker und WebAssembly nicht.' }); return; }
  worker?.terminate();
  core = undefined;
  state = 'loading'; pending = true; refresh();
  try {
    worker = new Worker(new URL('./emulator.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<CoreEvent>) => receive(event.data);
    worker.onerror = event => { event.preventDefault(); receive({ type: 'error', code: 'WORKER_FAILURE', message: event.message || 'Der Emulator-Worker konnte nicht gestartet werden.' }); };
    send({ type: 'init' });
  } catch (error) { receive({ type: 'error', code: 'WORKER_FAILURE', message: String(error) }); }
}
retry.onclick = initialize;
file.onchange = () => {
  const selected = file.files?.[0]; file.value = '';
  if (!selected || !core) return;
  const problem = validateFile(selected, core);
  if (problem) { el('status').textContent = problem; return; }
  el('filename').textContent = selected.name;
  pending = true; refresh(); send({ type: 'load', file: selected });
};
start.onclick = async () => {
  pending = true; refresh();
  try { await audio.enable(); }
  catch (error) { appendLog(`Tonausgabe nicht verfügbar: ${String(error)}`); }
  send({ type: 'start' }); canvas.focus();
};
pause.onclick = () => { resetInput(); pending = true; refresh(); audio.clear(); send({ type: 'pause' }); };
stop.onclick = () => { resetInput(); pending = true; refresh(); audio.clear(); send({ type: 'stop' }); };
el('fullscreen').onclick = () => { void el('screen').requestFullscreen().catch(error => appendLog(`Vollbild: ${String(error)}`)); };
const keymap: Record<string, Button> = { KeyX: 'A', KeyZ: 'B', Digit1: 'ONE', Digit2: 'TWO', Enter: 'PLUS', Minus: 'MINUS', KeyH: 'HOME', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' };
canvas.addEventListener('keydown', event => { const button = keymap[event.code]; if (!button || state !== 'running') return; event.preventDefault(); buttons.add(button); input(); });
canvas.addEventListener('keyup', event => { const button = keymap[event.code]; if (!button) return; event.preventDefault(); buttons.delete(button); input(); });
canvas.addEventListener('blur', resetInput);
window.addEventListener('blur', resetInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInput(); if (state === 'running') pause.click(); } });
canvas.addEventListener('pointermove', event => { const rect = canvas.getBoundingClientRect(); pointer = { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)), visible: true }; input(); });
canvas.addEventListener('pointerleave', () => { pointer = { ...pointer, visible: false }; input(); });
canvas.addEventListener('pointerdown', () => canvas.focus());
for (const [label, available] of [ ['WebAssembly', 'WebAssembly' in window], ['Worker', 'Worker' in window], ['Geteilter Speicher', window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'] ] as const) {
  const item = document.createElement('li'); item.textContent = `${label}: ${available ? 'verfügbar' : 'nicht verfügbar'}`; el('capabilities').append(item);
}
initialize();
