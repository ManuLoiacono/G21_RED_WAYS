/**
 * Street-View-like perspective view of a 360° cylindrical mosaic, drawn with WebGL2.
 *
 * Each screen pixel is turned into a viewing ray (yaw, pitch, field of view), the ray into
 * azimuth/elevation, and those into a position in the mosaic. Assumptions, stated in the viewer:
 * - the mosaic covers 360° horizontally and has square angular pixels (same degrees per pixel
 *   vertically), as JPL cylindrical mosaics do;
 * - elevation grows linearly with the row;
 * - the horizon row is not published, so the caller passes an estimate (the middle of the
 *   photographed band). An error there only bends vertical lines a little when looking up or down.
 */

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;       // canvas size, device pixels
uniform float uFocal;    // focal length, device pixels
uniform float uYaw;      // mosaic fraction at the screen center (0..1, left to right)
uniform float uPitch;    // radians, positive = looking up
uniform float uAspect;   // mosaic width / height
uniform float uHorizon;  // mosaic height fraction of elevation 0 (estimate)
uniform vec2 uRange;     // vertical range shown, mosaic height fractions
uniform vec2 uStretch;   // display stretch [lo, hi]; [0, 1] = none
uniform vec3 uBackground;
out vec4 outColor;
const float TAU = 6.28318530718;
void main() {
  vec2 p = gl_FragCoord.xy - 0.5 * uRes;
  vec3 d = normalize(vec3(p.x, p.y, uFocal));
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 r = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float az = atan(r.x, r.z);
  float el = asin(clamp(r.y, -1.0, 1.0));
  vec2 uv = vec2(uYaw + az / TAU, uHorizon - el * uAspect / TAU);
  if (uv.y < uRange.x || uv.y > uRange.y) { outColor = vec4(uBackground, 1.0); return; }
  // Derivatives of the unwrapped coordinate, so the 0/1 seam does not pick the smallest mipmap.
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 c = textureGrad(uTex, vec2(fract(uv.x), uv.y), dx, dy).rgb;
  c = clamp((c - uStretch.x) / (uStretch.y - uStretch.x), 0.0, 1.0);
  outColor = vec4(c, 1.0);
}`;

export interface SphereParams {
  /** Mosaic fraction at the screen center (yaw). */
  yaw: number;
  /** Mosaic height fraction at the screen center. */
  center: number;
  /** Vertical field of view, radians. */
  fovV: number;
  aspect: number;
  horizon: number;
  range: [number, number];
  stretch: [number, number] | null;
}

export interface SphereView {
  /** Uploads the mosaic. Returns false if WebGL cannot use it (then use the flat view). */
  setImage(img: HTMLImageElement): boolean;
  render(params: SphereParams): void;
}

/** Background outside the shown band (same as the stage). */
const BACKGROUND: [number, number, number] = [0, 0, 0];

export function createSphereView(canvas: HTMLCanvasElement): SphereView | null {
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
    return s;
  };
  const program = gl.createProgram()!;
  try {
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link error");
  } catch (err) {
    console.warn("Panorama 360° view unavailable:", err);
    return null;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    res: u("uRes"),
    focal: u("uFocal"),
    yaw: u("uYaw"),
    pitch: u("uPitch"),
    aspect: u("uAspect"),
    horizon: u("uHorizon"),
    range: u("uRange"),
    stretch: u("uStretch"),
    background: u("uBackground"),
  };
  gl.uniform1i(u("uTex"), 0);
  gl.uniform3fv(loc.background, BACKGROUND);

  const texture = gl.createTexture();
  let hasImage = false;

  return {
    setImage(img) {
      hasImage = false;
      try {
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        let source: TexImageSource = img;
        const scale = Math.min(1, max / img.naturalWidth, max / img.naturalHeight);
        if (scale < 1) {
          // Larger than this GPU accepts: downscale once.
          const c = document.createElement("canvas");
          c.width = Math.floor(img.naturalWidth * scale);
          c.height = Math.floor(img.naturalHeight * scale);
          c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
          source = c;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        hasImage = gl.getError() === gl.NO_ERROR;
      } catch (err) {
        console.warn("Panorama texture upload failed:", err); // e.g. image without CORS
      }
      return hasImage;
    },

    render(p) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      if (!hasImage) {
        gl.clearColor(...BACKGROUND, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }
      gl.uniform2f(loc.res, w, h);
      gl.uniform1f(loc.focal, h / 2 / Math.tan(p.fovV / 2));
      gl.uniform1f(loc.yaw, p.yaw);
      gl.uniform1f(loc.pitch, ((p.horizon - p.center) * 2 * Math.PI) / p.aspect);
      gl.uniform1f(loc.aspect, p.aspect);
      gl.uniform1f(loc.horizon, p.horizon);
      gl.uniform2f(loc.range, p.range[0], p.range[1]);
      gl.uniform2f(loc.stretch, ...(p.stretch ?? [0, 1]));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
