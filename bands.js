/* ==========================================================================
   Truebourne — bands of light
   A close-up of one stretch of a hero horizon: the same fibrous band of light,
   filling a panel (or the letters of the footer lockup) and flowing slowly.
   One small WebGL2 context per canvas, drawn only while it is on screen.
   ========================================================================== */
(function () {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PANEL = [5 / 255, 7 / 255, 11 / 255];   // the darkest a band panel goes
  const STILL = 9.0;          // frame used for reduced motion

  // angle: direction of flow on screen (deg; 0 = rightward, 90 = downward).
  // span: band units across the panel (the hero's channel is 0.4 wide, so ~0.3 is a close-up).
  // margin: [near, far] — how far each horizon sits beyond its edge of the panel; a little below 0
  //   lets a sliver of the black hole's shadow in, which is what makes the light read as light.
  // side: which edge is the near one. gains: brightness of the band off the near and far horizons.
  // bend: curvature (the horizon bulges gently into the panel). thick: band depth vs the hero's.
  // grain: fibre fineness. core / floor / glow: the white-hot line, the brightness between
  //   fibres, and the soft glow reaching across the panel. maxPr: device px per CSS px, at most.
  const CARD = { span: 0.3, margin: [-0.008, 0.05], gains: [0.72, 0.06], thick: 0.85, grain: 1.2, core: 0.5, floor: 0.3, glow: 0.08,
    speed: 0.035, surge: [7, 0.07], exposure: 0.95, maxPr: 1 };
  const PRESETS = {
    creative: Object.assign({}, CARD, { angle: 90, side: 1, bend: 0.4, seed: 1.3 }),
    semantic: Object.assign({}, CARD, { angle: -32, side: -1, bend: -0.35, seed: 2.9 }),
    agent: Object.assign({}, CARD, { angle: 0, side: -1, bend: 0.3, seed: 4.4 }),
    // The hero's horizontal channel: a band off each edge, dimming to deep navy behind the copy.
    begin: { angle: -6, side: 1, span: 0.4, margin: [-0.008, -0.008], gains: [0.6, 0.5], bend: 0.12, thick: 0.55, grain: 1.2,
      core: 0.5, floor: 0.3, glow: 0.06, speed: 0.03, surge: [6, 0.06], seed: 6.2, exposure: 0.9, maxPr: 1 },
    // Inside the footer lockup: the horizon sits just above it, so the light covers every letter —
    // brightest along the top, cooling to deep azure at the foot, never dark.
    lockup: { angle: 0, side: -1, span: 0.24, margin: [0.035, 0.2], gains: [0.8, 0], bend: 0, thick: 1.3, grain: 1.0,
      core: 0.35, floor: 0.45, glow: 0.22, speed: 0.045, surge: [3.2, 0.08], seed: 8.1, exposure: 1.0, maxPr: 2,
      base: [0.025, 0.055, 0.15] }
  };

  const VS = `#version 300 es
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const FS = `#version 300 es
  precision highp float;
  precision highp int;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uPx;        // device px per band unit
  uniform vec2 uDir;        // flow direction (GL, y up)
  uniform float uSide;
  uniform float uSpan;
  uniform vec2 uMargin;     // how far each horizon sits beyond its edge of the panel (near, far; < 0 shows a sliver of shadow)
  uniform vec2 uGains;
  uniform float uBend;
  uniform float uThick;
  uniform float uGrain;     // fibre fineness vs the hero's
  uniform float uCore;      // the white-hot line along the horizon
  uniform float uFloor;     // body brightness between fibres (lower = more contrast)
  uniform float uGlow;      // soft glow reaching far across the panel
  uniform float uSpeed;
  uniform vec2 uSurge;      // frequency, speed
  uniform float uSeed;
  uniform float uExposure;
  uniform vec3 uBase;       // the darkest the band goes
  uniform float uMask;
  uniform sampler2D uMaskTex;
  uniform vec3 uOuter;      // outside the mask
  out vec4 outColor;

  const float GAP = 0.014;

  uint pcg(uint v) {
    uint s = v * 747796405u + 2891336453u;
    uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (w >> 22u) ^ w;
  }
  float cell(ivec2 c) { return float(pcg(uint(c.x) * 1597334677u ^ pcg(uint(c.y) ^ 0x9e3779b9u))) * (1.0 / 4294967295.0); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    ivec2 c = ivec2(i);
    return mix(mix(cell(c), cell(c + ivec2(1, 0)), u.x), mix(cell(c + ivec2(0, 1)), cell(c + ivec2(1, 1)), u.x), u.y);
  }

  // The hero's fibres: noise stretched ~50x along the flow, wavering as it drifts.
  float fibres(float along, float across, float seed) {
    across += (vnoise(vec2((along - uTime * 0.12) * 0.9 + seed, across * 6.0 * uGrain + uTime * 0.05)) - 0.5) * 0.05 / uGrain;
    across += (vnoise(vec2((along - uTime * 0.2) * 2.3 - seed, across * 14.0 * uGrain - uTime * 0.08)) - 0.5) * 0.012 / uGrain;
    float sum = 0.0, norm = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float fa = 0.45 * pow(1.9, fi);
      float fc = 22.0 * uGrain * pow(2.1, fi);
      float w = pow(0.72, fi) * (1.0 - smoothstep(0.25, 0.5, fc / uPx));   // drop fibres finer than ~2px
      float drift = uTime * uSpeed * (1.0 + 0.3 * fi);
      sum += w * vnoise(vec2((along - drift) * fa, across * fc) + vec2(seed * 7.1 + fi * 13.7, fi * 5.3));
      norm += w;
    }
    return sum / max(norm, 1e-3);
  }

  // One band, d deep into the open space off its horizon: a white-hot line hugging the shadow,
  // a fibrous body, wisps fraying outward, and the soft glow the hero gets from its bloom.
  float band(float d, float along, float seed) {
    float tex = fibres(along, d, seed);
    float fib = smoothstep(0.3, 0.82, tex);
    float depth = max(d - GAP, 0.0);
    float core = exp(-depth / (0.045 * uThick)) * uCore;
    float body = exp(-depth / (0.135 * uThick)) * (uFloor + (1.35 - uFloor) * fib);
    float wisps = exp(-depth / (0.2 * uThick)) * smoothstep(0.55, 0.95, tex) * 0.45;
    float glow = exp(-depth / (0.32 * uThick)) * uGlow;
    return smoothstep(GAP, GAP + 0.018, d) * (core + body + wisps + glow);
  }

  vec3 heat(float x) {
    vec3 c = mix(vec3(0.05, 0.11, 0.42), vec3(0.2, 0.48, 1.0), smoothstep(0.0, 0.35, x));
    c = mix(c, vec3(0.62, 0.82, 1.0), smoothstep(0.35, 0.9, x));
    return mix(c, vec3(0.93, 0.97, 1.0), smoothstep(0.9, 1.8, x));
  }
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 fc = gl_FragCoord.xy;
    vec2 p = (fc - 0.5 * uRes) / uPx;
    float along = dot(p, uDir);
    float across = dot(p, vec2(-uDir.y, uDir.x)) * uSide + uBend * along * along;
    float W = uSpan + uMargin.x + uMargin.y;               // horizon to horizon
    float d1 = across + 0.5 * uSpan + uMargin.x;
    float d2 = 0.5 * uSpan + uMargin.y - across;
    float I = uGains.x * band(d1, along, uSeed) * (1.0 - smoothstep(0.8 * W, W, d1))
            + uGains.y * band(d2, along, uSeed + 4.1) * (1.0 - smoothstep(0.8 * W, W, d2));
    // Long, slow surges sliding along the band.
    I *= 1.2 * (1.0 + 0.35 * pow(0.5 + 0.5 * sin((along - uTime * uSurge.y) * uSurge.x + uSeed * 1.7), 3.0));

    vec3 col = aces(heat(I) * I * uExposure);
    col = pow(col, vec3(1.0 / 2.2));
    col = mix(uBase, vec3(1.0), col);
    if (uMask > 0.5) col = mix(uOuter, col, texture(uMaskTex, vec2(fc.x / uRes.x, 1.0 - fc.y / uRes.y)).a);
    col += (hash(fc + fract(uTime) * 91.7) - 0.5) / 255.0;
    outColor = vec4(max(col, 0.0), 1.0);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Band shader compile failed: ' + log);
    }
    return s;
  }

  function program(gl) {
    const p = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Band program link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  /* ------------------------------------------------------------------------
     One shared frame loop for every band on the page
     ------------------------------------------------------------------------ */
  const bands = [];
  const t0 = performance.now();
  let raf = 0;
  const now = () => (reduced ? STILL : (performance.now() - t0) / 1000);

  function loop(ms) {
    raf = 0;
    const t = (ms - t0) / 1000;
    let any = false;
    for (let i = 0; i < bands.length; i++) {
      if (bands[i].live()) { bands[i].render(t); any = true; }
    }
    if (any) raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf && !reduced) raf = requestAnimationFrame(loop); }

  class Band {
    constructor(canvas, cfg, mask) {
      this.canvas = canvas;
      this.cfg = cfg;
      this.mask = mask || null;
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'default' });
      if (!gl) throw new Error('WebGL2 unavailable');
      this.gl = gl;
      this.prog = program(gl);
      this.vao = gl.createVertexArray();
      if (this.mask) this.maskTex = gl.createTexture();
      this.W = 0; this.H = 0;
      this.onScreen = false; this.active = true; this.lost = false;

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.lost = true;
        canvas.parentElement.classList.add('band-lost');
      });
      this.io = new IntersectionObserver(([en]) => {
        this.onScreen = en.isIntersecting;
        if (this.onScreen) wake();
      }, { rootMargin: '80px 0px' });
      this.io.observe(canvas);
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }

    live() { return this.onScreen && this.active && !this.lost && this.W > 0; }

    /** Pause a band that is on screen but hidden (a deck card that has faded out). */
    setActive(on) {
      if (on === this.active) return;
      this.active = on;
      if (on) wake();
    }

    resize() {
      const cssW = this.canvas.clientWidth, cssH = this.canvas.clientHeight;
      if (!cssW || !cssH) return;
      const pr = Math.min(window.devicePixelRatio || 1, this.cfg.maxPr);
      const W = Math.max(2, Math.round(cssW * pr)), H = Math.max(2, Math.round(cssH * pr));
      if (W === this.W && H === this.H) return;
      this.W = W; this.H = H;
      this.canvas.width = W; this.canvas.height = H;
      if (this.mask) this._drawMask();
      this.render(now());   // never show an empty frame, even off screen
    }

    // Rasterize the mask shape (SVG path data) at the canvas's resolution.
    _drawMask() {
      const { paths, viewBox } = this.mask;
      const c = document.createElement('canvas');
      c.width = this.W; c.height = this.H;
      const ctx = c.getContext('2d');
      const sx = this.W / viewBox[2], sy = this.H / viewBox[3];
      ctx.setTransform(sx, 0, 0, sy, -viewBox[0] * sx, -viewBox[1] * sy);
      ctx.fillStyle = '#fff';
      paths.forEach((d) => ctx.fill(new Path2D(d)));
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    render(t) {
      const gl = this.gl, c = this.cfg, u = this.prog.u;
      if (this.lost || !this.W) return;
      const a = (c.angle * Math.PI) / 180;
      const dx = Math.cos(a), dy = -Math.sin(a);           // screen y is down, GL y is up
      const ext = this.W * Math.abs(dy) + this.H * Math.abs(dx);   // the panel's extent across the flow
      gl.viewport(0, 0, this.W, this.H);
      gl.useProgram(this.prog.p);
      gl.bindVertexArray(this.vao);
      gl.uniform2f(u.uRes, this.W, this.H);
      gl.uniform1f(u.uTime, t + c.seed * 11);
      gl.uniform1f(u.uPx, ext / c.span);
      gl.uniform2f(u.uDir, dx, dy);
      gl.uniform1f(u.uSide, c.side);
      gl.uniform1f(u.uSpan, c.span);
      gl.uniform2f(u.uMargin, c.margin[0], c.margin[1]);
      gl.uniform2f(u.uGains, c.gains[0], c.gains[1]);
      gl.uniform1f(u.uBend, c.bend);
      gl.uniform1f(u.uThick, c.thick);
      gl.uniform1f(u.uGrain, c.grain);
      gl.uniform1f(u.uCore, c.core);
      gl.uniform1f(u.uFloor, c.floor);
      gl.uniform1f(u.uGlow, c.glow);
      gl.uniform1f(u.uSpeed, c.speed);
      gl.uniform2f(u.uSurge, c.surge[0], c.surge[1]);
      gl.uniform1f(u.uSeed, c.seed);
      gl.uniform1f(u.uExposure, c.exposure);
      const base = c.base || PANEL;
      gl.uniform3f(u.uBase, base[0], base[1], base[2]);
      gl.uniform1f(u.uMask, this.mask ? 1 : 0);
      if (this.mask) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
        gl.uniform1i(u.uMaskTex, 0);
        gl.uniform3f(u.uOuter, 5 / 255, 5 / 255, 5 / 255);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  window.TBBands = {
    supported() {
      try {
        return !!document.createElement('canvas').getContext('webgl2');
      } catch (e) {
        return false;
      }
    },
    /** Light a canvas with the named band. mask: { paths: [svg path data], viewBox: [x, y, w, h] }. */
    attach(canvas, name, mask) {
      const cfg = PRESETS[name];
      if (!cfg) throw new Error('Unknown band: ' + name);
      const b = new Band(canvas, cfg, mask);
      bands.push(b);
      return b;
    },
    presets: PRESETS
  };
})();
