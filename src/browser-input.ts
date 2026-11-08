import type { Button, InputState } from './protocol';
/** Tastatur: X=A, Z=B, 1/2, Enter=+, Minus=-, H=Home, Pfeile=Steuerkreuz. Maus: links=A, rechts=B. */
export const keyMap: Record<string, Button> = { KeyX: 'A', KeyZ: 'B', Digit1: 'ONE', Digit2: 'TWO', Enter: 'PLUS', Minus: 'MINUS', KeyH: 'HOME', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' };
const mouseMap: [number, Button][] = [[1, 'A'], [2, 'B']]; // PointerEvent.buttons: Bit 0 links, Bit 1 rechts
const order: Button[] = ['A', 'B', 'ONE', 'TWO', 'PLUS', 'MINUS', 'HOME', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
type Pointer = InputState['pointer'];
export const neutralState = (): InputState => ({ buttons: [], pointer: { x: .5, y: .5, visible: false }, accel: { x: 0, y: 0, z: 1 } });
/** Normierter IR-Zeiger (0..1, Ursprung oben links) bezogen auf das sichtbare Bild; Letterbox-Rand zählt nicht. */
export function imagePointer(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, imageWidth: number, imageHeight: number): Pointer {
  const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight);
  const width = imageWidth * scale, height = imageHeight * scale;
  const nx = (x - rect.left - (rect.width - width) / 2) / width, ny = (y - rect.top - (rect.height - height) / 2) / height;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return { x: .5, y: .5, visible: false };
  return { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)), visible: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
}
export function mouseButtons(mask: number): Button[] { return mouseMap.filter(([bit]) => mask & bit).map(([, button]) => button); }
/** Gemeinsam genutzt von der Produktionsseite und dem Browser-Gasttest. Liefert reset() und dispose(). */
export function bindBrowserInput(canvas: HTMLCanvasElement, enabled: () => boolean, emit: (input: InputState) => void, win: EventTarget | undefined = typeof window === 'undefined' ? undefined : window) {
  const keys = new Set<Button>(); let mouse = new Set<Button>(); let pointer: Pointer = { x: .5, y: .5, visible: false };
  const state = (): InputState => ({ buttons: order.filter(b => keys.has(b) || mouse.has(b)), pointer: { ...pointer }, accel: { x: 0, y: 0, z: 1 } });
  const send = () => { if (enabled()) emit(state()); };
  const reset = () => { keys.clear(); mouse = new Set(); pointer = { x: .5, y: .5, visible: false }; emit(neutralState()); };
  const track = (e: PointerEvent) => { pointer = imagePointer(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height); mouse = new Set(mouseButtons(e.buttons)); };
  const on: [EventTarget, string, (e: any) => void][] = [
    [canvas, 'keydown', (e: KeyboardEvent) => { const b = keyMap[e.code]; if (!b || e.ctrlKey || e.metaKey || e.altKey) return; e.preventDefault(); if (!enabled()) return; keys.add(b); send(); }],
    [canvas, 'keyup', (e: KeyboardEvent) => { const b = keyMap[e.code]; if (!b) return; e.preventDefault(); keys.delete(b); send(); }],
    [canvas, 'blur', reset], [canvas, 'pointermove', (e: PointerEvent) => { track(e); send(); }],
    [canvas, 'pointerdown', (e: PointerEvent) => { canvas.focus(); try { canvas.setPointerCapture?.(e.pointerId); } catch { /* Zeiger nicht mehr aktiv */ } e.preventDefault(); track(e); send(); }],
    [canvas, 'pointerup', (e: PointerEvent) => { track(e); if (e.pointerType === 'touch') pointer = { ...pointer, visible: false }; send(); }],
    [canvas, 'pointercancel', reset], [canvas, 'lostpointercapture', () => { if (mouse.size) { mouse = new Set(); send(); } }],
    [canvas, 'pointerleave', (e: PointerEvent) => { if (e.buttons) return; pointer = { ...pointer, visible: false }; send(); }],
    [canvas, 'contextmenu', (e: Event) => e.preventDefault()],
  ];
  if (win) on.push([win, 'blur', reset]);
  for (const [target, type, fn] of on) target.addEventListener(type, fn);
  return { reset, dispose: () => { for (const [target, type, fn] of on) target.removeEventListener(type, fn); } };
}
