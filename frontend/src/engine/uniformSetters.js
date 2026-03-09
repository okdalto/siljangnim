/**
 * Uniform setter factory and geometry creator map — extracted from GLEngine.js.
 */

import { createQuadGeometry, createBoxGeometry, createSphereGeometry, createPlaneGeometry } from "./geometries.js";

/**
 * Map GL uniform type enum → setter function.
 * @param {WebGL2RenderingContext} gl
 * @param {number} type — GL enum for the uniform type
 * @param {WebGLUniformLocation} loc
 * @returns {Function}
 */
export function uniformSetter(gl, type, loc) {
  switch (type) {
    case gl.FLOAT:        return (v) => gl.uniform1f(loc, v);
    case gl.FLOAT_VEC2:   return (x, y) => gl.uniform2f(loc, x, y);
    case gl.FLOAT_VEC3:   return (x, y, z) => gl.uniform3f(loc, x, y, z);
    case gl.FLOAT_VEC4:   return (x, y, z, w) => gl.uniform4f(loc, x, y, z, w);
    case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: case gl.SAMPLER_3D: case gl.SAMPLER_CUBE:
                          return (v) => gl.uniform1i(loc, v);
    case gl.INT_VEC2:     return (x, y) => gl.uniform2i(loc, x, y);
    case gl.INT_VEC3:     return (x, y, z) => gl.uniform3i(loc, x, y, z);
    case gl.INT_VEC4:     return (x, y, z, w) => gl.uniform4i(loc, x, y, z, w);
    case gl.FLOAT_MAT2:   return (v) => gl.uniformMatrix2fv(loc, false, v);
    case gl.FLOAT_MAT3:   return (v) => gl.uniformMatrix3fv(loc, false, v);
    case gl.FLOAT_MAT4:   return (v) => gl.uniformMatrix4fv(loc, false, v);
    default:              return (v) => gl.uniform1f(loc, v);
  }
}

export const GEOMETRY_CREATORS = {
  quad: createQuadGeometry,
  box: createBoxGeometry,
  sphere: createSphereGeometry,
  plane: createPlaneGeometry,
};
