// Small WebGL2 helpers exposed to scene scripts through ctx.utils.
import { ATTRIB } from "./shader";

type UniformInput = number | boolean | ArrayLike<number>;

interface UniformInfo {
  location: WebGLUniformLocation;
  type: number;
  size: number;
}

const uniformCache = new WeakMap<WebGLProgram, Map<string, UniformInfo>>();

function uniformsOf(gl: WebGL2RenderingContext, program: WebGLProgram): Map<string, UniformInfo> {
  let map = uniformCache.get(program);
  if (map) return map;
  map = new Map();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const location = gl.getUniformLocation(program, info.name);
    if (location) map.set(info.name.replace(/\[0\]$/, ""), { location, type: info.type, size: info.size });
  }
  uniformCache.set(program, map);
  return map;
}

function toArray(value: UniformInput): number[] {
  if (typeof value === "number") return [value];
  if (typeof value === "boolean") return [value ? 1 : 0];
  return Array.from(value);
}

/** Set uniforms by name; names the program doesn't use are ignored. Program must be in use. */
export function setUniforms(gl: WebGL2RenderingContext, program: WebGLProgram, values: Record<string, UniformInput>): void {
  const uniforms = uniformsOf(gl, program);
  for (const [name, value] of Object.entries(values)) {
    const info = uniforms.get(name);
    if (!info) continue;
    const v = toArray(value);
    const loc = info.location;
    switch (info.type) {
      case gl.FLOAT: gl.uniform1fv(loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(loc, v.slice(0, 3 * info.size)); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(loc, v); break;
      case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: case gl.SAMPLER_3D: case gl.SAMPLER_CUBE: case gl.SAMPLER_2D_ARRAY:
        gl.uniform1iv(loc, v.map(Math.trunc)); break;
      case gl.INT_VEC2: case gl.BOOL_VEC2: gl.uniform2iv(loc, v.map(Math.trunc)); break;
      case gl.INT_VEC3: case gl.BOOL_VEC3: gl.uniform3iv(loc, v.map(Math.trunc)); break;
      case gl.INT_VEC4: case gl.BOOL_VEC4: gl.uniform4iv(loc, v.map(Math.trunc)); break;
      case gl.FLOAT_MAT2: gl.uniformMatrix2fv(loc, false, v); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(loc, false, v); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(loc, false, v); break;
      default: break;
    }
  }
}

/** Bind a texture to a unit and point the sampler uniform at it. Program must be in use. */
export function bindTexture(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, texture: WebGLTexture | null, unit = 0): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  setUniforms(gl, program, { [name]: unit });
}

export interface Drawable {
  vao: WebGLVertexArrayObject;
  count: number;
  draw(mode?: number, instances?: number): void;
  dispose(): void;
}

export function createFullscreenQuad(gl: WebGL2RenderingContext): Drawable {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(ATTRIB.position);
  gl.vertexAttribPointer(ATTRIB.position, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return {
    vao,
    count: 3,
    draw(mode = gl.TRIANGLES) {
      gl.bindVertexArray(vao);
      gl.drawArrays(mode, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(buffer);
    },
  };
}

export interface GeometryData {
  positions: ArrayLike<number>;
  normals?: ArrayLike<number>;
  uvs?: ArrayLike<number>;
  indices?: ArrayLike<number>;
  /** Components per position (2 or 3). Defaults to 3. */
  dimension?: number;
}

/** Upload geometry into a VAO bound to the standard attribute locations. */
export function createMesh(gl: WebGL2RenderingContext, geometry: GeometryData): Drawable {
  const vao = gl.createVertexArray();
  const buffers: WebGLBuffer[] = [];
  gl.bindVertexArray(vao);
  const attribute = (location: number, data: ArrayLike<number> | undefined, size: number) => {
    if (!data) return;
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(Array.from(data)), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  };
  const dimension = geometry.dimension ?? 3;
  attribute(ATTRIB.position, geometry.positions, dimension);
  attribute(ATTRIB.normal, geometry.normals, 3);
  attribute(ATTRIB.uv, geometry.uvs, 2);

  let indexType = 0;
  let count = geometry.positions.length / dimension;
  if (geometry.indices) {
    const indices = geometry.indices;
    const big = Array.from(indices).some((i) => i > 65535);
    const data = big ? new Uint32Array(Array.from(indices)) : new Uint16Array(Array.from(indices));
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
    indexType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    count = data.length;
  }
  gl.bindVertexArray(null);

  return {
    vao,
    count,
    draw(mode = gl.TRIANGLES, instances = 1) {
      gl.bindVertexArray(vao);
      if (indexType) gl.drawElementsInstanced(mode, count, indexType, 0, instances);
      else gl.drawArraysInstanced(mode, 0, count, instances);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteVertexArray(vao);
      for (const b of buffers) gl.deleteBuffer(b);
    },
  };
}

export interface TextureOptions {
  flipY?: boolean;
  wrap?: "clamp" | "repeat" | "mirror";
  filter?: "linear" | "nearest";
  mipmap?: boolean;
}

export interface LoadedTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

export async function loadTexture(gl: WebGL2RenderingContext, url: string, options: TextureOptions = {}): Promise<LoadedTexture> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`loadTexture: ${response.status} for ${url}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: options.flipY === false ? "none" : "flipY",
    premultiplyAlpha: "none",
  });
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  const wrap = { clamp: gl.CLAMP_TO_EDGE, repeat: gl.REPEAT, mirror: gl.MIRRORED_REPEAT }[options.wrap ?? "clamp"];
  const nearest = options.filter === "nearest";
  const mipmap = options.mipmap ?? true;
  if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    nearest ? gl.NEAREST : mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  const result = { texture, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}
