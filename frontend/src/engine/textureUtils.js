/**
 * Shared WebGL texture utilities for data-texture managers.
 *
 * Eliminates duplicated _uploadTexture / _uploadFloat32Texture code
 * across AudioManager, MediaPipeManager, MIDIManager, TFDetectorManager,
 * SAMManager, and OSCManager.
 */

/**
 * Create or update a WebGL2 data texture.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture|null} existing — pass null to create a new texture
 * @param {number} width
 * @param {number} height
 * @param {TypedArray|null} data — Float32Array for RGBA32F, Uint8Array for R8, or null
 * @param {object} [opts]
 * @param {number} [opts.internalFormat] — gl.RGBA32F (default) or gl.R8 etc.
 * @param {number} [opts.format]         — gl.RGBA (default) or gl.RED etc.
 * @param {number} [opts.type]           — gl.FLOAT (default) or gl.UNSIGNED_BYTE etc.
 * @param {number} [opts.filter]         — gl.NEAREST (default) or gl.LINEAR
 * @param {boolean} [opts.forceRealloc]  — if true, use texImage2D even on existing texture
 * @returns {WebGLTexture}
 */
export function uploadDataTexture(gl, existing, width, height, data, opts = {}) {
  const internalFormat = opts.internalFormat ?? gl.RGBA32F;
  const format = opts.format ?? gl.RGBA;
  const type = opts.type ?? gl.FLOAT;
  const filter = opts.filter ?? gl.NEAREST;
  const forceRealloc = opts.forceRealloc ?? false;

  let tex = existing;
  if (!tex) {
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (forceRealloc) {
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, format, type, data);
    }
  }
  return tex;
}

/**
 * Delete a WebGL texture if it exists.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture|null} texture
 */
export function deleteTexture(gl, texture) {
  if (texture && gl) gl.deleteTexture(texture);
}
