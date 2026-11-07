// Isolated precheck (NOT emulation): verifies the GPU features that Dolphin's
// OGL backend uses on its GLES 3.0 path (docs/av-status.md) exist in WebGL2,
// and records the WebGPU equivalents. Result is exposed as window.__result.

function webgl2Probe() {
  const canvas = new OffscreenCanvas(64, 64);
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false });
  if (!gl) return { available: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const r = {
    available: true,
    version: gl.getParameter(gl.VERSION),
    glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    limits: {},
    extensions: {},
    checks: {},
  };
  for (const k of ['MAX_TEXTURE_SIZE', 'MAX_ARRAY_TEXTURE_LAYERS', 'MAX_TEXTURE_IMAGE_UNITS',
    'MAX_UNIFORM_BLOCK_SIZE', 'MAX_UNIFORM_BUFFER_BINDINGS', 'MAX_VERTEX_UNIFORM_BLOCKS',
    'MAX_FRAGMENT_UNIFORM_BLOCKS', 'MAX_DRAW_BUFFERS', 'MAX_SAMPLES', 'MAX_VERTEX_ATTRIBS',
    'MAX_COMBINED_TEXTURE_IMAGE_UNITS'])
    r.limits[k] = gl.getParameter(gl[k]);
  // Dolphin needs: dual-source blend (or framebuffer fetch), clip distance,
  // float render targets, anisotropic, compressed formats.
  for (const e of ['WEBGL_blend_func_extended', 'WEBGL_clip_cull_distance', 'EXT_color_buffer_float',
    'EXT_color_buffer_half_float', 'EXT_texture_filter_anisotropic', 'WEBGL_compressed_texture_s3tc',
    'EXT_texture_compression_bptc', 'WEBGL_provoking_vertex', 'KHR_parallel_shader_compile',
    'OES_texture_float_linear', 'EXT_disjoint_timer_query_webgl2'])
    r.extensions[e] = !!gl.getExtension(e);

  // Rendering check: UBO + sampler object + 2D-array texture + dual-source blend + RGBA8 readback.
  const bfe = gl.getExtension('WEBGL_blend_func_extended');
  const vs = `#version 300 es
layout(std140) uniform Consts { vec4 tint; };
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 uv;
void main(){ vec2 p = P[gl_VertexID]; uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
  const fsDual = `#version 300 es
#extension GL_EXT_blend_func_extended : require
precision highp float; precision highp sampler2DArray;
layout(std140) uniform Consts { vec4 tint; };
uniform sampler2DArray tex;
in vec2 uv;
layout(location = 0, index = 0) out vec4 ocol0;
layout(location = 0, index = 1) out vec4 ocol1;
void main(){ ocol0 = texture(tex, vec3(uv, 1.0)) * tint; ocol1 = vec4(0.5); }`;
  const fsPlain = fsDual.replace('#extension GL_EXT_blend_func_extended : require\n', '')
    .replace('layout(location = 0, index = 0) out vec4 ocol0;\nlayout(location = 0, index = 1) out vec4 ocol1;', 'out vec4 ocol0;')
    .replace(' ocol1 = vec4(0.5);', '');
  function prog(v, f) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, v], [gl.FRAGMENT_SHADER, f]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function setup(p) {
    gl.useProgram(p);
    gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, 'Consts'), 0);
    gl.uniform1i(gl.getUniformLocation(p, 'tex'), 0);
  }
  try {
    gl.bindVertexArray(gl.createVertexArray());
    const ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array([1, 0.5, 0.25, 1]), gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 2);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255]));
    const smp = gl.createSampler();
    gl.samplerParameteri(smp, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(smp, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindSampler(0, smp);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, 64, 64);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    gl.viewport(0, 0, 64, 64);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4);
    // plain path (no dual source): expect tex(200)*tint = 200,100,50,255
    setup(prog(vs, fsPlain));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    r.checks.plain = { pixel: Array.from(px), expected: [200, 100, 50, 255] };
    r.checks.plain.pass = r.checks.plain.pixel.every((v, i) => Math.abs(v - r.checks.plain.expected[i]) <= 1);
    // dual source path: src*1 + dst*(1-src1) with src1=.5, dst=(200,100,50,255): 200+100, ... clamped
    if (bfe) {
      gl.clearColor(0.2, 0.2, 0.2, 0.2); gl.clear(gl.COLOR_BUFFER_BIT);
      setup(prog(vs, fsDual));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, bfe.ONE_MINUS_SRC1_COLOR_WEBGL);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // src=(.784,.392,.196,1), dst=.2 -> src + dst*(1-.5) = (.884,.492,.296,1.1->1)
      const exp = [225, 125, 75, 255];
      r.checks.dualSource = { pixel: Array.from(px), expected: exp, pass: exp.every((v, i) => Math.abs(v - px[i]) <= 2) };
    } else r.checks.dualSource = { pass: false, note: 'WEBGL_blend_func_extended missing' };
  } catch (e) { r.checks.error = String(e); }
  return r;
}

async function webgpuProbe() {
  if (!navigator.gpu) return { available: false, reason: 'navigator.gpu undefined' };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { available: false, reason: 'requestAdapter() returned null' };
  const info = adapter.info || {};
  return {
    available: true,
    info: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description },
    features: [...adapter.features],
    isFallbackAdapter: adapter.isFallbackAdapter,
    limits: Object.fromEntries(['maxTextureDimension2D', 'maxTextureArrayLayers', 'maxBindGroups', 'maxUniformBufferBindingSize',
      'maxStorageBufferBindingSize', 'maxSampledTexturesPerShaderStage', 'maxColorAttachments', 'maxVertexAttributes']
      .map(k => [k, adapter.limits[k]])),
    dualSourceBlending: adapter.features.has('dual-source-blending'),
    clipDistances: adapter.features.has('clip-distances'),
  };
}


export async function runProbe() {
  const out = { webgl2: null, webgpu: null };
  try { out.webgl2 = webgl2Probe(); } catch (e) { out.webgl2 = { error: String(e) }; }
  try { out.webgpu = await webgpuProbe(); } catch (e) { out.webgpu = { error: String(e) }; }
  out.userAgent = navigator.userAgent;
  out.crossOriginIsolated = self.crossOriginIsolated;
  out.hardwareConcurrency = navigator.hardwareConcurrency;
  return out;
}
