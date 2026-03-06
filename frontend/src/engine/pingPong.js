/**
 * pingPong — Ping-pong FBO helper for multi-pass rendering.
 * Wraps createRenderTarget internally.
 */

export function createPingPong(gl, width, height, options = {}) {
  const {
    internalFormat = gl.RGBA8,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    filter = gl.LINEAR,
    depth = false,
    count = 1, // number of color attachments (MRT)
  } = options;

  let w = width, h = height;
  let current = 0;

  function makeTarget() {
    if (count <= 1) {
      // Single attachment — simple FBO
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      let depthRenderbuffer = null;
      if (depth) {
        depthRenderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderbuffer);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return { framebuffer, texture, textures: [texture], depthRenderbuffer };
    }

    // MRT — multiple color attachments
    const textures = [];
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    const drawBuffers = [];
    for (let i = 0; i < count; i++) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
      textures.push(tex);
      drawBuffers.push(gl.COLOR_ATTACHMENT0 + i);
    }
    gl.drawBuffers(drawBuffers);

    let depthRenderbuffer = null;
    if (depth) {
      depthRenderbuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderbuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { framebuffer, texture: textures[0], textures, depthRenderbuffer };
  }

  function destroyTarget(target) {
    gl.deleteFramebuffer(target.framebuffer);
    for (const tex of target.textures) gl.deleteTexture(tex);
    if (target.depthRenderbuffer) gl.deleteRenderbuffer(target.depthRenderbuffer);
  }

  let targets = [makeTarget(), makeTarget()];

  return {
    read() { return targets[current]; },
    write() { return targets[1 - current]; },
    swap() { current = 1 - current; },
    resize(newW, newH) {
      w = newW; h = newH;
      destroyTarget(targets[0]);
      destroyTarget(targets[1]);
      targets = [makeTarget(), makeTarget()];
      current = 0;
    },
    dispose() {
      destroyTarget(targets[0]);
      destroyTarget(targets[1]);
    },
    get width() { return w; },
    get height() { return h; },
  };
}
