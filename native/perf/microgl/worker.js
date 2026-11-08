// Mikrotest: Worker-OffscreenCanvas-WebGL2 mit Dolphin-aehnlichen Mustern; misst readPixels-Latenz je Frame.
self.onmessage = async (e) => {
  const { flags, w, h, frames, draws } = e.data; const F = new Set(flags);
  const canvas = new OffscreenCanvas(w, h);
  const gl = canvas.getContext("webgl2", { alpha: false, depth: true, stencil: true, antialias: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
  if (!gl) { postMessage({ flags, error: "no webgl2" }); return; }
  const dbg = gl.getExtension("WEBGL_debug_renderer_info"); const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?";
  const vs = `#version 300 es\nlayout(std140) uniform U { vec4 c[8]; }; in vec2 p; in vec4 col; out vec4 vc; void main(){ vc = col*c[0]; gl_Position = vec4(p,0.,1.); }`;
  const fs = `#version 300 es\nprecision highp float; in vec4 vc; uniform sampler2D tx; out vec4 o; void main(){ o = vc*texture(tx, gl_FragCoord.xy/vec2(640.,528.)); }`;
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(prog, s); }
  gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { postMessage({ flags, error: gl.getProgramInfoLog(prog) }); return; }
  gl.useProgram(prog); gl.uniformBlockBinding(prog, gl.getUniformBlockIndex(prog, "U"), 0);
  const STREAM = F.has("bigstream") ? 8 * 1024 * 1024 : 64 * 1024;
  const vbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbuf); gl.bufferData(gl.ARRAY_BUFFER, STREAM, gl.STREAM_DRAW);
  const ubuf = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, ubuf); gl.bufferData(gl.UNIFORM_BUFFER, 4096, gl.STREAM_DRAW); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubuf);
  const pl = gl.getAttribLocation(prog, "p"), cl = gl.getAttribLocation(prog, "col"); gl.enableVertexAttribArray(pl); gl.enableVertexAttribArray(cl);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(256 * 256 * 4).fill(200));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  let efb = null;
  if (F.has("efbfbo")) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); const d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
    efb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, efb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, d); gl.bindTexture(gl.TEXTURE_2D, tex); }
  if (F.has("efbarray")) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, 1);
    const dt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, dt); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH32F_STENCIL8, w, h, 1);
    efb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, efb); gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, 0); gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, dt, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, tex); }
  const dst = new Uint8Array(w * h * 4); const times = []; let off = 0; const t00 = performance.now();
  const quad = (x) => new Float32Array([-1, -1, 1, 1, 1, 1, x, -1, 1, 1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  for (let f = 0; f < frames; f++) {
    if (efb) gl.bindFramebuffer(gl.FRAMEBUFFER, efb);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (let d = 0; d < draws; d++) {
      if (F.has("blend")) { gl.enable(gl.BLEND); gl.blendFunc(d & 1 ? gl.SRC_ALPHA : gl.ONE, d & 2 ? gl.ONE_MINUS_SRC_ALPHA : gl.ZERO); gl.colorMask(!(d & 4), true, true, !(d & 8)); }
      const data = quad(1); const bytes = data.byteLength;
      if (F.has("advance")) { if (off + bytes > STREAM) off = 0; gl.bindBuffer(gl.ARRAY_BUFFER, vbuf); gl.bufferSubData(gl.ARRAY_BUFFER, off, data); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 24, off); gl.vertexAttribPointer(cl, 4, gl.FLOAT, false, 24, off + 8); off += bytes; }
      else { gl.bindBuffer(gl.ARRAY_BUFFER, vbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(cl, 4, gl.FLOAT, false, 24, 8); }
      if (F.has("ubo")) { gl.bindBuffer(gl.UNIFORM_BUFFER, ubuf); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, new Float32Array(32).fill(1)); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (efb) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, efb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    const t0 = performance.now(); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, dst); times.push(performance.now() - t0);
  }
  const s = [...times].sort((a, b) => a - b);
  postMessage({ flags, renderer, frames, draws, total_ms: Math.round(performance.now() - t00), read_median: +s[s.length >> 1].toFixed(1), read_max: +s[s.length - 1].toFixed(1) });
};
