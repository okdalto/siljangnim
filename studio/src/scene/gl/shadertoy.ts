// Shadertoy-style shaders (mainImage, iTime, iResolution, iMouse, iChannel0-3, Buffers A-D) on the
// scene's WebGL2 context, so open-licensed Shadertoy code runs as written (ctx.utils.shadertoy).
import { createProgram, FULLSCREEN_VERTEX_SHADER } from "./shader";
import { setUniforms, type Drawable, type UniformInput } from "./helpers";

export type BufferName = "A" | "B" | "C" | "D";
const BUFFERS: BufferName[] = ["A", "B", "C", "D"];

/** A channel: another buffer by name, or a texture (e.g. from ctx.utils.loadTexture). */
export type ShadertoyChannel = BufferName | { texture: WebGLTexture; width: number; height: number } | null | undefined;

export interface ShadertoyPass {
  code: string;
  channels?: ShadertoyChannel[];
}

export interface ShadertoyOptions {
  /** Shadertoy's Common tab: prepended to every pass. */
  common?: string;
  /** iChannel0-3 of the Image pass. */
  channels?: ShadertoyChannel[];
  buffers?: Partial<Record<BufferName, ShadertoyPass>>;
}

export interface ShadertoyFrame {
  time: number;
  dt: number;
  frame: number;
  resolution: [number, number];
  /** ctx.mouse: normalized, origin top-left; [x, y, clickX, clickY]. */
  mouse: [number, number, number, number];
  mouseDown: boolean;
  /** Scene uniforms, set by name on every pass that declares them. */
  uniforms?: Record<string, UniformInput>;
}

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform float iFrameRate;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform float iSampleRate;
uniform vec3 iChannelResolution[4];
uniform float iChannelTime[4];
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
out vec4 shadertoy_FragColor;
`;

const FOOTER = `
void main() {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(color, gl_FragCoord.xy);
  shadertoy_FragColor = color;
}
`;

/** Number of lines the wrapper adds before the person's code (to map compile errors back). */
export function headerLines(common = ""): number {
  return HEADER.split("\n").length - 1 + (common ? common.split("\n").length : 0);
}

/** Shadertoy source → a GLSL ES 3.00 fragment shader. Accepts code that still has its own #version line. */
export function wrapShadertoy(code: string, common = ""): string {
  const strip = (s: string) => s.replace(/^\s*#version[^\n]*\n/, "");
  return HEADER + (common ? strip(common) + "\n" : "") + strip(code) + FOOTER;
}

/** Shadertoy's iMouse: pixels, origin bottom-left; z > 0 while pressed, w > 0 only on the press frame. */
export function shadertoyMouse(f: ShadertoyFrame, wasDown: boolean, last: [number, number]): { mouse: number[]; last: [number, number] } {
  const [w, h] = f.resolution;
  const px: [number, number] = [f.mouse[0] * w, (1 - f.mouse[1]) * h];
  const click: [number, number] = [f.mouse[2] * w, (1 - f.mouse[3]) * h];
  if (f.mouseDown) return { mouse: [px[0], px[1], click[0], wasDown ? -click[1] : click[1]], last: px };
  return { mouse: [last[0], last[1], -click[0], -click[1]], last };
}

interface Pass {
  program: WebGLProgram;
  channels: ShadertoyChannel[];
}

export function createShadertoy(gl: WebGL2RenderingContext, quad: Drawable, image: string, options: ShadertoyOptions = {}) {
  gl.getExtension("EXT_color_buffer_float");
  const make = (code: string, label: string): WebGLProgram => {
    try {
      return createProgram(gl, FULLSCREEN_VERTEX_SHADER, wrapShadertoy(code, options.common));
    } catch (err) {
      // Say which pass failed and how its line numbers relate to the code that was passed in.
      if (err instanceof Error) err.message = `Shadertoy ${label}: ${err.message} (line N in the error is line N - ${headerLines(options.common)} of the ${label} code)`;
      throw err;
    }
  };
  const imagePass: Pass = { program: make(image, "Image"), channels: options.channels ?? [] };
  const bufferPasses = BUFFERS.flatMap((name) => {
    const b = options.buffers?.[name];
    return b ? [{ name, pass: { program: make(b.code, `Buffer ${name}`), channels: b.channels ?? [] } as Pass }] : [];
  });
  // Two float targets per buffer: read last frame's, write this frame's.
  const targets = new Map<BufferName, { tex: WebGLTexture[]; fbo: WebGLFramebuffer[]; read: number }>();
  let size: [number, number] = [0, 0];
  let wasDown = false;
  let last: [number, number] = [0, 0];

  function allocate(w: number, h: number) {
    for (const t of targets.values()) {
      t.tex.forEach((x) => gl.deleteTexture(x));
      t.fbo.forEach((x) => gl.deleteFramebuffer(x));
    }
    targets.clear();
    for (const { name } of bufferPasses) {
      const tex: WebGLTexture[] = [];
      const fbo: WebGLFramebuffer[] = [];
      for (let i = 0; i < 2; i++) {
        const t = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const f = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        tex.push(t);
        fbo.push(f);
      }
      targets.set(name, { tex, fbo, read: 0 });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    size = [w, h];
  }

  function run(pass: Pass, f: ShadertoyFrame, mouse: number[], target: WebGLFramebuffer | null) {
    const [w, h] = f.resolution;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pass.program);
    const p = pass.program;
    const loc = (n: string) => gl.getUniformLocation(p, n);
    gl.uniform3f(loc("iResolution"), w, h, 1);
    gl.uniform1f(loc("iTime"), f.time);
    gl.uniform1f(loc("iTimeDelta"), f.dt);
    gl.uniform1f(loc("iFrameRate"), f.dt > 0 ? 1 / f.dt : 60);
    gl.uniform1i(loc("iFrame"), f.frame);
    gl.uniform4fv(loc("iMouse"), mouse);
    const d = new Date();
    gl.uniform4f(loc("iDate"), d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000);
    gl.uniform1f(loc("iSampleRate"), 44100);
    if (f.uniforms) setUniforms(gl, p, f.uniforms);
    const res: number[] = [];
    for (let i = 0; i < 4; i++) {
      const c = pass.channels[i];
      let tex: WebGLTexture | null = null;
      let cw = 0, ch = 0;
      if (typeof c === "string") {
        const t = targets.get(c);
        if (t) [tex, cw, ch] = [t.tex[t.read] ?? null, w, h];
      } else if (c) [tex, cw, ch] = [c.texture, c.width, c.height];
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc(`iChannel${i}`), i);
      res.push(cw, ch, 1);
    }
    gl.uniform3fv(loc("iChannelResolution[0]") ?? loc("iChannelResolution"), res);
    gl.uniform1fv(loc("iChannelTime[0]") ?? loc("iChannelTime"), [f.time, f.time, f.time, f.time]);
    quad.draw();
  }

  return {
    /** Render the buffers in order (A to D), then the image to the screen. Call once per frame in render. */
    draw(f: ShadertoyFrame) {
      const [w, h] = f.resolution;
      if (bufferPasses.length && (size[0] !== w || size[1] !== h)) allocate(w, h);
      const m = shadertoyMouse(f, wasDown, last);
      wasDown = f.mouseDown;
      last = m.last;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      for (const { name, pass } of bufferPasses) {
        const t = targets.get(name)!;
        run(pass, f, m.mouse, t.fbo[1 - t.read] ?? null);
        t.read = 1 - t.read;
      }
      run(imagePass, f, m.mouse, null);
    },
    dispose() {
      for (const t of targets.values()) {
        t.tex.forEach((x) => gl.deleteTexture(x));
        t.fbo.forEach((x) => gl.deleteFramebuffer(x));
      }
      gl.deleteProgram(imagePass.program);
      for (const { pass } of bufferPasses) gl.deleteProgram(pass.program);
    },
  };
}
