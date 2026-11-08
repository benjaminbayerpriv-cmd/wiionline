# Machbarkeit: OGL/WebGL2-Pfad statt Software-Renderer (nur Lesen, nichts gebaut, nichts gemessen)

Stand 2026-11-08, Kern-Zweig. Grundlage: Quellen im Arbeitsbaum (Dolphin e22551e + 64 Patches), Artefakt `dist-core` (nur mit `strings` gelesen), die Doku des Vorprojekts (`dougchansan/wasm-dolphin`, 7e38409, `docs/ogl-performance-plan.md`, `rendering-modes.md`) und `docs/av-status.md` auf `origin/claude/browser-av`. Es wurde **kein** OGL-Lauf ausgeführt. Alles Folgende ist Quellen- bzw. Dokumentationslage, keine eigene Messung.

## Kurzantwort
Der OGL-Pfad ist im aktuellen Kern enthalten und ist der einzige realistische Weg, den Software-Rasterizer-Engpass (siehe `docs/performance-status.md`: ~3 Spielbilder/s bei Wii Play) zu umgehen. Er ist aber **kein Drop-in-Ersatz**: Er ist nirgends als funktionierend belegt, und die einzige vorhandene Messung (Vorprojekt, Mai 2026, anderes Spiel, älterer JIT-Stand) war schlechter als Software. Ob er Wii Play flüssig macht, ist offen und nur durch einen Versuch klärbar.

## Was vorhanden ist (statisch belegt)
- Backend einkompiliert: Build-Flags enthalten `-DHAS_OPENGL`; im `.wasm` finden sich "OpenGL ES", GLSL `#version 300 es`, `GL_EXT_blend_func_extended`, `glReadPixels`. `SetVideoBackend("OGL"|"OpenGL"|"OpenGL ES")` wird vom Kern akzeptiert (setzt `GFX_PREFER_GLES`, `GFX_HACK_SKIP_XFB_COPY_TO_RAM`).
- Eigener GL-Kontext für Emscripten (`Common/GL/GLInterface/Emscripten.cpp`, `GLContextEmscripten`), WebGL2-Anpassungen im OGL-Backend (Tiefenbereich in [0,1] erzwungen, Reverse-Z aus, Map-Range-Flags, Vertex-Attribut-Workaround; Patches 0004/0005 aus dem Vorprojekt).
- Link-Flags passend: `MIN/MAX_WEBGL_VERSION=2`, `FULL_ES3`, `OFFSCREEN_FRAMEBUFFER=1`, `OFFSCREENCANVAS_SUPPORT=1`, Pthreads.
- Drei Module-Schalter, die vom Kern gelesen werden: `dolphinOglReadbackPresent` (Bild per `glReadPixels` in den RGBA-Puffer des Kerns), `dolphinOglWorkerWebGl` (worker-eigener Kontext), `dolphinOglTestClear` (Diagnose). Diese werden in `createDolphinCore({...})` übergeben; unsere Seite setzt sie nicht.
- Die Bildübergabe (`FrameBuffer`/`GetFrame`) ist für den Readback-Pfad vorgesehen (`glfb:`-Pfad in `dolphin_web_discio.cpp`).

## Bekannte Blocker (Vorprojekt-Doku, nicht von mir verifiziert)
1. **Sichtbare Bildrate**: OGL+`oglproxy=readback`: Spielzeit ~99 %, aber nur ~1,3 sichtbare Bilder/s (Melee). Der Worker-Pfad (`oglproxy=worker`) zeigte "0 distinct" auf dem sichtbaren Canvas; Pthread-`postMessage` wurde verschluckt; OffscreenCanvas-Mirror malte nicht. Vorprojekt wählte deshalb Software als besten Pfad.
2. **Readback-Kosten**: synchrones `glReadPixels` je Bild ~10–15 ms bei 320×240 (dort gemessen); bei voller Wii-Auflösung mehr. Nötig wäre asynchrones Auslesen (PBO/Fences) oder Direktpräsentation per OffscreenCanvas.
3. **CPU-Ruckler/JIT**: Dort "bursty CPU swings 10–327 %" und JIT-Fehlrendering im OGL-Pfad (später im Software-Pfad per Carry-Fix behoben; für OGL nicht erneut belegt). Der Kern hat für OGL konservativere JIT-Standardwerte.
4. **Shader-Kompilierung**: WebGL hat keine geteilten Hintergrund-Kontexte; Kern setzt `GFX_SHADER_COMPILATION_MODE=Synchronous` ⇒ Ruckeln beim ersten Auftreten jeder Shader-Variante (Spiele erzeugen Hunderte). Ubershader/Vorkompilierung ungeprüft.
5. **WebGL2-Funktionslücken** (laut AV-Bericht, Quellenlage): kein Compute/Texel-Buffer (CPU-Texturdekodierung), kein Geometry-Shader, keine Bounding-Box, Logik-Ops nur genähert, Dual-Source-Blending nur mit `WEBGL_blend_func_extended`. Auswirkung auf Wii Play ungeprüft.
6. **Kontext im GPU-Thread**: Der GL-Kontext lebt im Pthread des Kerns; Präsentation hängt an `OFFSCREEN_FRAMEBUFFER`/explizitem Swap. Eigene Seite müsste Canvas/Readback an den Kern-Worker anbinden (Grafik-Zweig/`src/`).
7. **Headless-Falle**: Headless Chrome nutzt oft SwiftShader (Software-GL); damit gemessene OGL-Zahlen wären wertlos. Ein Versuch muss in einem Chrome mit echter GPU laufen.
8. Nicht geprüft: Firefox/Safari, Speicher (1,5 GiB fest), Interaktion mit Audio.

## Vergleich der Wege (Software bleibt nicht tragfähig)
- **Software parallelisieren**: Wii Play braucht grob 1,15 Mio TEV-Pixel/Bild ×60 ≈ 70 Mio/s; gemessen schafft ein Thread ~4 Mio/s. Mit 8 Threads ideal ~32 Mio/s (≈ halbe Rate), real weniger. Kein Weg auf 60 fps.
- **WebGL2/OGL**: einziger kurzfristig verfügbarer GPU-Pfad; Risiken oben.
- **WebGPU-Backend** (Patch 0006+): größer, hängt am Naga-Stub (`native/stubs/naga_stub.c`); ohne echten Naga keine Shader. Nicht kurzfristig.

## Empfehlung / nächster Schritt (nicht ausgeführt)
Zeitlich begrenzter Versuch im **sichtbaren Chrome mit echter GPU**, ohne Kern-Neubau: Kern mit `{dolphinOglReadbackPresent: true}` initialisieren, `SetVideoBackend("OGL")`, Wii Play bis Titelbild; dann (a) Sichtbarkeit neuer Bilder (Vollinhalts-Hash, nicht VI-Zähler), (b) Spielzeit-Rate, (c) Konsolenfehler/GL-Fehler. Das ist Arbeit an Seite/Worker (`src/`, Grafik-Zweig); für den Kern ggf. folgen: asynchroner Readback, Direktpräsentation, Shader-Vorkompilierung. Erfolgskriterium: ≥ 20 verschiedene Bilder/s am Titel bei Spielzeit ≥ 0,9, sonst Pfad verwerfen.
Keine Änderungen am Grafik-Zweig oder an gemeinsamen Build-Dateien vorgenommen.
