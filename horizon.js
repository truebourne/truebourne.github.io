/* ==========================================================================
   Truebourne — Event Horizon hero
   Four black holes, seen so close that only their horizons show. Each horizon
   is one long smooth sweep; the open space where the four almost meet takes
   the shape of the Truebourne mark. Along every horizon runs a thick band of
   light — long fibres drifting slowly, pouring in down the vertical gaps and
   out along the horizontal ones.
   Everything is analytic, so the intro is identical on every load.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Shape — echoes the mark rather than tracing it
     ------------------------------------------------------------------------ */
  // Centre lines of the four open channels (x for the vertical ones, y for the horizontal ones).
  // As in the mark, the left arm sits low and the right arm high.
  const CHANNEL = { top: 0, bottom: 0, left: -0.24, right: 0.24 };
  const HALF = 0.2;           // half-width of each channel
  // Each horizon is a hyperbola between two channel walls. k sets how long and soft the sweep is:
  // the mark's long curves are upper-left and lower-right. Listed CCW round the channels.
  const HOLES = [
    { sx: -1, sy: 1, k: 0.03 },     // upper-left: runs from the top channel round to the left one
    { sx: -1, sy: -1, k: 0.007 },   // lower-left: left → bottom
    { sx: 1, sy: -1, k: 0.03 },     // lower-right: bottom → right
    { sx: 1, sy: 1, k: 0.007 }      // upper-right: right → top
  ];
  // Light pours in down the vertical channels and streams out along the horizontal ones.
  const FLOW = [1, -1, 1, -1];
  const FLOW_SPEED = 0.07;    // logo units per second
  const GAP = 0.014;          // the band starts just off the shadow's edge

  const FAR = 9;              // horizons run this far out (well off-screen)
  const REACH = 3.8;          // extent of the polylines handed to the no-WebGL fallback
  const FIELD_EXTENT = 3.2;   // the distance field covers [-E, E]² in logo units
  const FIELD_SIZE = 384;
  const BLOOM_LEVELS = 6;

  // Intro choreography, in seconds from first frame. Slow and heavy.
  const TIMELINE = {
    zoom: [0.0, 4.2],        // the camera drifts in
    flow: [0.3, 3.5],        // one unbroken sweep: light pours in down the vertical gaps, straight through
                             // the mark (flaring as it passes) and out along the horizontal ones
    glow: [1.3, 3.2],
    motion: [1.0, 3.5],      // then the fibres waver and surges run along the bands, and never quite settle
    formed: 1.9,             // hero copy is revealed here
    still: 6.0               // frame used for reduced motion
  };
  // The flow front travels from FRONT[0] (above and below the screen) to FRONT[1] (past its sides).
  const FRONT = [-1.3, 3.4];
  // When the front crosses the mark — the flare is timed to it.
  const FLARE_AT = TIMELINE.flow[0] + (Math.acos(1 + (2 * FRONT[0]) / (FRONT[1] - FRONT[0])) / Math.PI) * (TIMELINE.flow[1] - TIMELINE.flow[0]);
  const ZOOM_FROM = 0.62;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ramp = (range, t) => smoothstep(range[0], range[1], t);
  const progress = (range, t) => clamp01((t - range[0]) / (range[1] - range[0]));
  const easeInOutSine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));

  /* ------------------------------------------------------------------------
     Geometry
     ------------------------------------------------------------------------ */
  // Four polylines in CCW order round the open channels (open space on their left).
  function buildHorizons() {
    return HOLES.map((h, i) => {
      const ox = (h.sy > 0 ? CHANNEL.top : CHANNEL.bottom) + h.sx * HALF;
      const oy = (h.sx < 0 ? CHANNEL.left : CHANNEL.right) + h.sy * HALF;
      const r = Math.sqrt(h.k);
      const S = Math.log(FAR / r);
      // u·v = k, with u measured away from the vertical wall and v away from the horizontal one.
      // Upper-left and lower-right start on their vertical end; the other two on their horizontal end.
      const fromVertical = i % 2 === 0;
      const line = [];
      const n = 600;
      for (let j = 0; j <= n; j++) {
        let s = -S + (2 * S * j) / n;
        if (fromVertical) s = -s;
        line.push([ox + h.sx * r * Math.exp(-s), oy + h.sy * r * Math.exp(s)]);
      }
      return measure(simplify(line, 4e-4));
    });
  }

  function measure(line) {
    const cum = [0];
    for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
    // Arc position 0: where the horizon comes closest to the heart of the mark.
    let best = 1e9, corner = 0;
    line.forEach((p, k) => { const d = Math.hypot(p[0], p[1]); if (d < best) { best = d; corner = cum[k]; } });
    return { line, cum, corner };
  }

  // Douglas–Peucker: the far, nearly straight stretches collapse to a few long segments,
  // which keeps building the distance field fast.
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    let worst = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dx * (pts[i][1] - a[1]) - dy * (pts[i][0] - a[0])) / l;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst <= eps) return [a, b];
    return simplify(pts.slice(0, at + 1), eps).slice(0, -1).concat(simplify(pts.slice(at), eps));
  }

  function pointAtArc(hz, a) {
    const s = Math.min(hz.cum[hz.cum.length - 1], Math.max(0, hz.corner + a));
    let k = 0;
    while (k < hz.cum.length - 2 && hz.cum[k + 1] < s) k++;
    const t = (s - hz.cum[k]) / (hz.cum[k + 1] - hz.cum[k] || 1);
    const p = hz.line[k], q = hz.line[k + 1];
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  }

  // RGBA: signed distance to the nearest horizon (+ inside a black hole), which horizon, arc from its corner.
  function buildField(hzs, size, extent) {
    const segs = [];
    hzs.forEach((hz, k) => {
      for (let i = 0; i < hz.line.length - 1; i++) segs.push([hz.line[i], hz.line[i + 1], k, hz.cum[i] - hz.corner]);
      segs.push([hz.line[hz.line.length - 1], hzs[(k + 1) % hzs.length].line[0], 4, 0]);   // far-off cap closing each channel
    });
    const m = segs.length;
    const x0 = new Float32Array(m), y0 = new Float32Array(m), dx = new Float32Array(m), dy = new Float32Array(m);
    const inv = new Float32Array(m), len = new Float32Array(m), id = new Float32Array(m), arc = new Float32Array(m);
    segs.forEach((s, i) => {
      x0[i] = s[0][0]; y0[i] = s[0][1]; dx[i] = s[1][0] - s[0][0]; dy[i] = s[1][1] - s[0][1];
      const l2 = dx[i] * dx[i] + dy[i] * dy[i];
      inv[i] = l2 > 0 ? 1 / l2 : 0; len[i] = Math.sqrt(l2); id[i] = s[2]; arc[i] = s[3];
    });
    const out = new Float32Array(size * size * 4);
    const step = (2 * extent) / size;
    for (let j = 0; j < size; j++) {
      const py = -extent + (j + 0.5) * step;
      for (let i = 0; i < size; i++) {
        const px = -extent + (i + 0.5) * step;
        let best = 1e9, bs = 0, bt = 0, inside = false;
        for (let s = 0; s < m; s++) {
          const wx = px - x0[s], wy = py - y0[s];
          let t = (wx * dx[s] + wy * dy[s]) * inv[s];
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = wx - dx[s] * t, qy = wy - dy[s] * t;
          const d2 = qx * qx + qy * qy;
          if (d2 < best) { best = d2; bs = s; bt = t; }
          const ya = y0[s], yb = ya + dy[s];
          if ((ya > py) !== (yb > py) && px < x0[s] + ((py - ya) / dy[s]) * dx[s]) inside = !inside;
        }
        const o = (j * size + i) * 4;
        const d = Math.sqrt(best);
        out[o] = inside ? -d : d;
        out[o + 1] = id[bs];
        out[o + 2] = arc[bs] + bt * len[bs];
        out[o + 3] = 0;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------------
     Shaders
     ------------------------------------------------------------------------ */
  // Screen ↔ logo space: the camera is a centre and a scale (px per logo unit).
  const SPACE = `
  uniform vec2 uCenter;
  uniform float uScale;
  uniform sampler2D uField;
  uniform float uFE;
  vec2 toLogo(vec2 fc) { return (fc - uCenter) / uScale; }
  // Beyond the field the channels run straight, so clamping along each axis stays correct.
  vec4 field(vec2 p) {
    vec2 c = clamp(p, vec2(-uFE * 0.995), vec2(uFE * 0.995));
    return texture(uField, c / (2.0 * uFE) + 0.5);
  }
  `;

  const VS_FULL = `#version 300 es
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const FS_SCENE = `#version 300 es
  precision highp float;
  precision highp int;
  uniform float uPR;
  uniform float uTime;
  uniform float uFront;
  uniform float uMotion;    // fibre turbulence and surges, once the intro settles     // how far along the flow the light has reached (logo units; the mark is 0)
  uniform float uHead;      // brightness of that leading edge (intro only)
  uniform float uFlare;
  uniform float uGlow;
  uniform float uEnergy;
  uniform float uOut;
  uniform float uSpeed;
  uniform float uHalf;
  uniform float uGap;
  uniform vec4 uFlow;
  uniform vec3 uMouse;
  out vec4 outColor;
  ${SPACE}

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

  // Long fibres lying along the flow: noise stretched ~50x along the band and drifting with it.
  // Finer fibres drift a touch faster, which reads as depth.
  float fibres(float along, float across, float seed) {
    // Turbulence: the fibres waver and shift across the band as they flow.
    across += (vnoise(vec2((along - uTime * 0.12) * 0.9 + seed, across * 6.0 + uTime * 0.05)) - 0.5) * (0.03 + 0.02 * uMotion);
    across += (vnoise(vec2((along - uTime * 0.2) * 2.3 - seed, across * 14.0 - uTime * 0.08)) - 0.5) * 0.012 * uMotion;
    float sum = 0.0, norm = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float fa = 0.45 * pow(1.9, fi);
      float fc = 22.0 * pow(2.1, fi);
      float w = pow(0.72, fi) * (1.0 - smoothstep(0.25, 0.5, fc / uScale));   // drop fibres finer than ~2px
      float drift = uTime * uSpeed * (1.0 + 0.3 * fi);
      sum += w * vnoise(vec2((along - drift) * fa, across * fc) + vec2(seed * 7.1 + fi * 13.7, fi * 5.3));
      norm += w;
    }
    return sum / max(norm, 1e-3);
  }

  // Colour follows intensity: deep navy wisps, azure through the body, ice-white at the core.
  vec3 heat(float x) {
    vec3 c = mix(vec3(0.05, 0.11, 0.42), vec3(0.2, 0.48, 1.0), smoothstep(0.0, 0.35, x));
    c = mix(c, vec3(0.62, 0.82, 1.0), smoothstep(0.35, 0.9, x));
    return mix(c, vec3(0.93, 0.97, 1.0), smoothstep(0.9, 1.8, x));
  }

  void main() {
    vec2 fc = gl_FragCoord.xy;
    vec2 p = toLogo(fc);
    vec4 F = field(p);
    float sd = F.r;                                  // + inside a black hole
    int id = int(F.g + 0.5);
    float dir = id == 0 ? uFlow.x : id == 1 ? uFlow.y : id == 2 ? uFlow.z : uFlow.w;
    float f = F.b * dir;                             // position along the flow; the mark sits at 0
    float s = abs(F.b);
    float d = -sd;                                   // depth into open space
    float px = sd * uScale;
    float open = 1.0 - smoothstep(-0.7 * uPR, 0.7 * uPR, px);

    // How far the light has flowed so far, with a bright leading edge during the intro.
    float lit = 1.0 - smoothstep(uFront - 0.35, uFront, f);
    float hd = (f - uFront + 0.12) / 0.12;
    float head = exp(-hd * hd) * uHead * 0.7;

    // Brightest where the horizons meet the mark.
    float along = (0.55 + 0.45 * exp(-s / 1.6)) * (1.0 + 0.7 * exp(-s / 0.4));

    // The band: thick and fibrous, starting just off the shadow's edge, fraying outward into
    // wisps, and gone by the middle of the channel where the opposite band takes over.
    float tex = fibres(f, d, float(id) * 3.7);
    float fib = smoothstep(0.3, 0.82, tex);
    float depth = max(d - uGap, 0.0);
    float body = exp(-depth / 0.135) * (0.3 + 1.05 * fib);
    float wisps = exp(-depth / 0.2) * smoothstep(0.55, 0.95, tex) * 0.55;
    float band = smoothstep(uGap, uGap + 0.018, d) * (body + wisps) * (1.0 - smoothstep(uHalf * 0.75, uHalf, d)) * open;

    // Long, slow surges of brightness sliding along the bands in the direction of flow.
    float surge = 1.0 + 0.32 * uMotion * pow(0.5 + 0.5 * sin((f - uTime * 0.22) * 2.6 + float(id) * 1.7), 3.0);

    float m = uMouse.z * exp(-length(p - uMouse.xy) / 0.45);
    float I = band * along * surge * (lit + head * 1.6) * 1.2 * (1.0 + 0.5 * m + 1.2 * uFlare * exp(-s / 0.8));


    // Where the four flows meet.
    float r = length(p);
    // Feathered at the shadows' edges so the glow never shows as a flat, hard-edged fill.
    float heart = (exp(-r / 0.2) * 0.12 * uGlow + (exp(-r / 0.24) * 1.5 + exp(-r / 0.5) * 0.06) * uFlare) * smoothstep(0.0, 0.06, d);

    vec3 col = heat(I) * I + heat(heart) * heart;
    outColor = vec4(col * uEnergy * uOut, 1.0);
  }`;

  // Dual-filter (Kawase) bloom.
  const FS_DOWN = `#version 300 es
  precision highp float;
  uniform sampler2D uSrc;
  uniform vec2 uTexel;
  uniform vec2 uDst;
  uniform float uThreshold;
  out vec4 outColor;
  void main() {
    vec2 uv = gl_FragCoord.xy / uDst;
    vec2 o = uTexel;
    vec3 s = texture(uSrc, uv).rgb * 4.0;
    s += texture(uSrc, uv - o).rgb;
    s += texture(uSrc, uv + o).rgb;
    s += texture(uSrc, uv + vec2(o.x, -o.y)).rgb;
    s += texture(uSrc, uv - vec2(o.x, -o.y)).rgb;
    s *= 0.125;
    if (any(isnan(s)) || any(isinf(s))) s = vec3(0.0);   // never let a stray NaN smear through the mips
    if (uThreshold > 0.0) {
      float br = max(s.r, max(s.g, s.b));
      float soft = clamp(br - uThreshold * 0.5, 0.0, uThreshold);
      soft = soft * soft / (2.0 * uThreshold + 1e-4);
      s *= max(soft, br - uThreshold) / max(br, 1e-4);
    }
    outColor = vec4(s, 1.0);
  }`;

  const FS_UP = `#version 300 es
  precision highp float;
  uniform sampler2D uSrc;
  uniform vec2 uTexel;
  uniform vec2 uDst;
  out vec4 outColor;
  void main() {
    vec2 uv = gl_FragCoord.xy / uDst;
    vec2 o = uTexel;
    vec3 s = texture(uSrc, uv + vec2(-o.x * 2.0, 0.0)).rgb;
    s += texture(uSrc, uv + vec2(-o.x, o.y)).rgb * 2.0;
    s += texture(uSrc, uv + vec2(0.0, o.y * 2.0)).rgb;
    s += texture(uSrc, uv + vec2(o.x, o.y)).rgb * 2.0;
    s += texture(uSrc, uv + vec2(o.x * 2.0, 0.0)).rgb;
    s += texture(uSrc, uv + vec2(o.x, -o.y)).rgb * 2.0;
    s += texture(uSrc, uv + vec2(0.0, -o.y * 2.0)).rgb;
    s += texture(uSrc, uv + vec2(-o.x, -o.y)).rgb * 2.0;
    outColor = vec4(s / 12.0, 1.0);
  }`;

  // Final: bloom + anamorphic flare, filmic tonemap; shadows kept deep so copy can sit in them.
  const FS_FINAL = `#version 300 es
  precision highp float;
  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform sampler2D uFlare;
  uniform vec2 uRes;
  uniform float uExposure;
  uniform float uBloomK;
  uniform float uFlareK;
  uniform float uInvOut;
  uniform float uFade;
  uniform vec2 uBottomFade;   // amount, and how far up the screen (0–1) it reaches
  uniform float uTime;
  out vec4 outColor;
  ${SPACE}

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 fc = gl_FragCoord.xy;
    vec2 uv = fc / uRes;
    vec3 scene = texture(uScene, uv).rgb;
    vec3 bloom = texture(uBloom, uv).rgb;
    vec3 fl = vec3(0.0);
    for (int k = -10; k <= 10; k++) {
      float w = exp(-abs(float(k)) / 4.0);
      fl += texture(uFlare, uv + vec2(float(k) * 0.012, 0.0)).rgb * w;
    }
    // Deep inside a black hole only a sliver of glow survives.
    float sd = field(toLogo(fc)).r;
    float deep = smoothstep(0.03, 0.16, sd);
    vec3 hdr = (scene + (bloom * uBloomK + fl * uFlareK * vec3(0.55, 0.72, 1.0)) * mix(1.0, 0.18, deep)) * uInvOut;
    if (any(isnan(hdr)) || any(isinf(hdr))) hdr = vec3(0.0);

    vec3 col = aces(hdr * uExposure);
    col = pow(col, vec3(1.0 / 2.2));
    vec2 q = uv - 0.5;
    col *= 1.0 - dot(q, q) * 0.4;
    col *= 1.0 - uBottomFade.x * smoothstep(uBottomFade.y, uBottomFade.y * 0.35, uv.y);
    col *= uFade;
    col = mix(vec3(5.0 / 255.0), vec3(1.0), col);             // blacks meet the page background (#050505)
    col += (noise(fc + fract(uTime) * 91.7) - 0.5) / 255.0;
    outColor = vec4(max(col, 0.0), 1.0);
  }`;

  /* ------------------------------------------------------------------------
     GL helpers
     ------------------------------------------------------------------------ */
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader compile failed: ' + log);
    }
    return s;
  }

  function program(gl, vsSrc, fsSrc) {
    const p = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  function target(gl, w, h, fmt) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, gl.RGBA, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h, ok };
  }

  function dataTexture(gl, internal, w, h, data, filter) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /* ------------------------------------------------------------------------
     Renderer
     ------------------------------------------------------------------------ */
  class Horizon {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.opts = Object.assign({ reducedMotion: false, skipIntro: false, onFormed: null }, opts);
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 unavailable');
      this.gl = gl;

      const small = Math.min(window.innerWidth, window.innerHeight) < 700 || matchMedia('(pointer: coarse)').matches;
      this.pr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);

      this.layout = { cx: 0, cy: 0, size: 300, fade: [0, 0.5] };
      this.scroll = { p: 0, px: 0 };
      this.mouse = { x: 0, y: 0, amt: 0, tx: 0, ty: 0, tamt: 0 };
      this.running = false;
      this.formedFired = false;
      this.frameTimes = [];
      // Skipping the intro starts the clock where it has settled (the reduced-motion frame), still flowing.
      this.t0 = performance.now() - (this.opts.skipIntro ? TIMELINE.still * 1000 : 0);
      this._frame = this._frame.bind(this);

      const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
      this.fmt = hasFloat ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT, out: 1 } : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE, out: 0.25 };

      this.progs = {
        scene: program(gl, VS_FULL, FS_SCENE),
        down: program(gl, VS_FULL, FS_DOWN),
        up: program(gl, VS_FULL, FS_UP),
        final: program(gl, VS_FULL, FS_FINAL)
      };
      this.fieldTex = dataTexture(gl, gl.RGBA16F, FIELD_SIZE, FIELD_SIZE, buildField(buildHorizons(), FIELD_SIZE, FIELD_EXTENT), gl.LINEAR);
      this.emptyVAO = gl.createVertexArray();

      this.onContextLost = (e) => { e.preventDefault(); this.stop(); this.lost = true; };
      canvas.addEventListener('webglcontextlost', this.onContextLost);
    }

    _allocTargets() {
      const gl = this.gl;
      [this.scene].concat(this.mips || []).filter(Boolean).forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); });
      this.scene = target(gl, this.W, this.H, this.fmt);
      if (!this.scene.ok && this.fmt.out === 1) {
        this.fmt = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE, out: 0.25 };
        gl.deleteTexture(this.scene.tex); gl.deleteFramebuffer(this.scene.fb);
        this.scene = target(gl, this.W, this.H, this.fmt);
      }
      this.mips = [];
      let w = this.W, h = this.H;
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
        this.mips.push(target(gl, w, h, this.fmt));
      }
    }

    /** Layout in CSS px: where the horizons meet and how big the mark is. fade: [amount, reach]
        darkens the lower part of the screen behind the copy on narrow layouts. */
    setLayout(cx, cy, size, fade) {
      this.layout = { cx, cy, size, fade: fade || [0, 0.5] };
      this.resize();
    }

    resize() {
      const cssW = this.canvas.clientWidth || window.innerWidth;
      const cssH = this.canvas.clientHeight || window.innerHeight;
      const W = Math.max(2, Math.round(cssW * this.pr));
      const H = Math.max(2, Math.round(cssH * this.pr));
      this.cssW = cssW; this.cssH = cssH;
      if (W !== this.W || H !== this.H) {
        this.W = W; this.H = H;
        this.canvas.width = W; this.canvas.height = H;
        this._allocTargets();
      }
      if (!this.running) this.render(this._now());
    }

    /** p: 0 → 1 as the hero scrolls away; px: scroll distance in CSS px (for parallax). */
    setScroll(p, px) {
      this.scroll = { p: clamp01(p), px };
      if (!this.running) this.render(this._now());
    }

    /** Pointer in CSS px relative to the top of the hero. Inactive (off the hero) eases back to rest. */
    pointer(xCss, yCss, active) {
      const L = this.layout;
      if (!active) { this.mouse.tx = 0; this.mouse.ty = 0; this.mouse.tamt = 0; return; }
      this.mouse.tx = (xCss - L.cx) / L.size;
      this.mouse.ty = (L.cy + this.scroll.px * 0.4 - yCss) / L.size;
      this.mouse.tamt = 1;
    }

    start() {
      if (this.running || this.lost) return;
      if (this.opts.reducedMotion) { this.render(this._now()); return; }
      this.running = true;
      this.raf = requestAnimationFrame(this._frame);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    _now() {
      return this.opts.reducedMotion ? TIMELINE.still : (performance.now() - this.t0) / 1000;
    }

    _frame(now) {
      if (!this.running) return;
      this.raf = requestAnimationFrame(this._frame);
      const t = (now - this.t0) / 1000;
      if (this.lastNow) this._adapt(now - this.lastNow, t);
      this.lastNow = now;
      this.render(t);
    }

    // Measure once the intro is under way; step resolution down once if frames are dropping.
    _adapt(dt, t) {
      if (this.adapted || t < 1.2) return;
      this.frameTimes.push(dt);
      if (this.frameTimes.length < 90) return;
      const sorted = this.frameTimes.slice().sort((a, b) => a - b);
      this.adapted = true;
      if (sorted[sorted.length >> 1] > 21) {
        this.pr = Math.max(1, this.pr * 0.7);
        this.W = 0;
        this.resize();
      }
    }

    render(t) {
      const gl = this.gl;
      if (!this.scene || this.lost) return;
      const W = this.W, H = this.H, pr = this.pr, L = this.layout, S = this.scroll;
      const m = this.mouse;
      m.x += (m.tx - m.x) * 0.05; m.y += (m.ty - m.y) * 0.05; m.amt += (m.tamt - m.amt) * 0.03;

      if (!this.formedFired && t >= TIMELINE.formed) {
        this.formedFired = true;
        if (this.opts.onFormed) this.opts.onFormed();
      }

      // Camera: a slow drift in, then breathing; scrolling pushes further in.
      const drift = easeInOutSine(progress(TIMELINE.zoom, t));
      const zoom = (ZOOM_FROM + (1 - ZOOM_FROM) * drift) * (1 + 0.015 * Math.sin(t * 0.16)) * (1 + 0.28 * S.p * S.p);
      const scale = L.size * zoom * pr;
      // The scene shies a few px away from the pointer; clamped so a far-off pointer can't push it far.
      const shy = (v) => -Math.max(-1, Math.min(1, v)) * 8 * m.amt;
      const cx = (L.cx + shy(m.x)) * pr;
      const cy = (this.cssH - (L.cy + S.px * 0.4) + shy(m.y)) * pr;

      // The flow front: eases in and out of the whole sweep, but never slows where it meets at the mark.
      const front = t >= TIMELINE.flow[1] ? 100 : FRONT[0] + (FRONT[1] - FRONT[0]) * easeInOutSine(progress(TIMELINE.flow, t));
      const head = 1 - smoothstep(TIMELINE.flow[1] - 0.8, TIMELINE.flow[1], t);
      const flare = Math.exp(-Math.pow((t - FLARE_AT) / 0.4, 2));
      const energy = 1 + S.p * 0.5;
      const out = this.fmt.out;

      const space = (P) => {
        gl.uniform2f(P.u.uCenter, cx, cy);
        gl.uniform1f(P.u.uScale, scale);
        gl.uniform1i(P.u.uField, 1);
        gl.uniform1f(P.u.uFE, FIELD_EXTENT);
      };
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
      gl.bindVertexArray(this.emptyVAO);

      // --- scene
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      let P = this.progs.scene;
      gl.useProgram(P.p);
      space(P);
      gl.uniform1f(P.u.uPR, pr);
      gl.uniform1f(P.u.uTime, t);
      gl.uniform1f(P.u.uFront, front);
      gl.uniform1f(P.u.uMotion, ramp(TIMELINE.motion, t));
      gl.uniform1f(P.u.uHead, head);
      gl.uniform1f(P.u.uFlare, flare);
      gl.uniform1f(P.u.uGlow, ramp(TIMELINE.glow, t));
      gl.uniform1f(P.u.uEnergy, energy);
      gl.uniform1f(P.u.uOut, out);
      gl.uniform1f(P.u.uSpeed, FLOW_SPEED);
      gl.uniform1f(P.u.uHalf, HALF);
      gl.uniform1f(P.u.uGap, GAP);
      gl.uniform4f(P.u.uFlow, FLOW[0], FLOW[1], FLOW[2], FLOW[3]);
      gl.uniform3f(P.u.uMouse, m.x, m.y, m.amt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // --- bloom
      const down = this.progs.down, up = this.progs.up;
      gl.useProgram(down.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(down.u.uSrc, 0);
      let src = this.scene;
      for (let i = 0; i < this.mips.length; i++) {
        const dst = this.mips[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(down.u.uTexel, 1 / src.w, 1 / src.h);
        gl.uniform2f(down.u.uDst, dst.w, dst.h);
        gl.uniform1f(down.u.uThreshold, i === 0 ? 0.12 * out : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = dst;
      }
      gl.useProgram(up.p);
      gl.uniform1i(up.u.uSrc, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.mips.length - 1; i > 0; i--) {
        const s = this.mips[i], dst = this.mips[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, s.tex);
        gl.uniform2f(up.u.uTexel, 1 / s.w, 1 / s.h);
        gl.uniform2f(up.u.uDst, dst.w, dst.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);

      // --- final composite
      P = this.progs.final;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(P.p);
      space(P);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      gl.uniform1i(P.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.mips[0].tex);
      gl.uniform1i(P.u.uBloom, 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.mips[2].tex);
      gl.uniform1i(P.u.uFlare, 4);
      gl.uniform2f(P.u.uRes, W, H);
      gl.uniform1f(P.u.uExposure, 0.9);
      gl.uniform1f(P.u.uBloomK, 0.24);
      gl.uniform1f(P.u.uFlareK, 0.018);
      gl.uniform1f(P.u.uInvOut, 1 / out);
      gl.uniform1f(P.u.uFade, 1 - smoothstep(0.05, 0.95, S.p));
      gl.uniform2f(P.u.uBottomFade, L.fade[0], L.fade[1]);
      gl.uniform1f(P.u.uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }

    destroy() {
      this.stop();
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  window.TBHorizon = {
    supported() {
      try {
        return !!document.createElement('canvas').getContext('webgl2');
      } catch (e) {
        return false;
      }
    },
    create(canvas, opts) {
      return new Horizon(canvas, opts);
    },
    /** The four horizons as polylines in logo units (y-up), for the no-WebGL fallback. */
    horizons(samples) {
      const n = samples || 96;
      return buildHorizons().map((hz) => {
        const pts = [];
        for (let j = 0; j < n; j++) pts.push(pointAtArc(hz, -REACH + (2 * REACH * j) / (n - 1)));
        return pts;
      });
    },
    /** Half-width of the open channels, in units of the mark's size (for laying out the copy). */
    channelHalf: HALF,
    timeline: TIMELINE
  };
})();
