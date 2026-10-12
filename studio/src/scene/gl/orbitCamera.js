// Orbit camera, the same in every scene (ctx.utils.createOrbitCamera):
//   drag             orbit around the target
//   right/middle drag or Shift+drag   pan
//   scroll (or +/-)  zoom
//   double-click     back to where it started
// Movement keeps a little inertia. Mouse positions are normalized (0..1), so
// speeds are per viewport, not per pixel.

import * as mat4 from "./mat4.js";

/**
 * @param {{
 *   distance?: number, theta?: number, phi?: number, target?: number[],
 *   fov?: number, near?: number, far?: number,
 *   minDistance?: number, maxDistance?: number,
 *   rotateSpeed?: number, panSpeed?: number, zoomSpeed?: number, damping?: number,
 *   autoRotate?: number,
 *   pointer?: { wheel: number, buttons: number, doubleClick: boolean },
 * }} [options]
 *   theta: horizontal angle (radians); phi: from the top (0) to the bottom (PI).
 *   rotateSpeed: radians per viewport dragged; autoRotate: radians per second while untouched.
 *   pointer: wheel/buttons/double-click (ctx.utils passes ctx.pointer).
 */
export function createOrbitCamera(options = {}) {
  let distance = options.distance ?? 5;
  let theta = options.theta ?? 0;
  let phi = options.phi ?? 0.5;
  let target = options.target ? [...options.target] : [0, 0, 0];
  const fov = options.fov ?? 45;
  const near = options.near ?? 0.05;
  const far = options.far ?? 1000;
  const minDistance = options.minDistance ?? 0.05;
  const maxDistance = options.maxDistance ?? Infinity;
  const rotateSpeed = options.rotateSpeed ?? 4;
  const panSpeed = options.panSpeed ?? 1;
  const zoomSpeed = options.zoomSpeed ?? 0.0015;
  const damping = options.damping ?? 0.88;
  const autoRotate = options.autoRotate ?? 0;
  const pointer = options.pointer ?? null;

  const start = { distance, theta, phi, target: [...target] };
  let vTheta = 0;
  let vPhi = 0;
  let idle = 0;

  const clampPhi = () => {
    phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi));
  };
  const clampDistance = () => {
    distance = Math.max(minDistance, Math.min(maxDistance, distance));
  };

  function getEye() {
    const sp = Math.sin(phi);
    return [target[0] + distance * sp * Math.sin(theta), target[1] + distance * Math.cos(phi), target[2] + distance * sp * Math.cos(theta)];
  }

  function pan(dx, dy) {
    // Move the target with the pointer: one viewport of drag ≈ the visible width at the target.
    const scale = distance * Math.tan((fov * Math.PI) / 360) * 2 * panSpeed;
    const right = [Math.cos(theta), 0, -Math.sin(theta)];
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const up = [-cp * Math.sin(theta), sp, -cp * Math.cos(theta)];
    for (let i = 0; i < 3; i++) target[i] += -right[i] * dx * scale + up[i] * dy * scale;
  }

  function reset() {
    distance = start.distance;
    theta = start.theta;
    phi = start.phi;
    target = [...start.target];
    vTheta = 0;
    vPhi = 0;
  }

  return {
    /** Call once per frame before drawing: update(ctx.mouse, ctx.mousePrev, ctx.mouseDown, ctx.keys, ctx.dt). */
    update(mouse, mousePrev, mouseDown, keys, dt) {
      const dx = mouse[0] - mousePrev[0];
      const dy = mouse[1] - mousePrev[1];
      const shift = keys && (keys.has("ShiftLeft") || keys.has("ShiftRight"));
      const buttons = pointer ? pointer.buttons : mouseDown ? 1 : 0;
      const panning = (buttons & 6) !== 0 || (mouseDown && shift);
      if (mouseDown && panning) {
        pan(dx, dy);
        vTheta = vPhi = 0;
      } else if (mouseDown) {
        vTheta = -dx * rotateSpeed;
        vPhi = -dy * rotateSpeed;
        theta += vTheta;
        phi += vPhi;
      } else {
        // Inertia after letting go, frame-rate independent.
        const keep = Math.pow(damping, (dt || 1 / 60) * 60);
        vTheta *= keep;
        vPhi *= keep;
        theta += vTheta;
        phi += vPhi;
      }
      clampPhi();

      let zoom = pointer ? pointer.wheel * zoomSpeed : 0;
      if (keys && (keys.has("Equal") || keys.has("NumpadAdd"))) zoom -= 0.03;
      if (keys && (keys.has("Minus") || keys.has("NumpadSubtract"))) zoom += 0.03;
      if (zoom) distance *= Math.exp(zoom);
      clampDistance();

      if (pointer?.doubleClick) reset();

      const touched = mouseDown || zoom !== 0;
      idle = touched ? 0 : idle + (dt || 0);
      if (autoRotate && idle > 1.5 && Math.abs(vTheta) < 1e-4) theta += autoRotate * (dt || 0);
    },
    getViewMatrix() {
      return mat4.lookAt(getEye(), target, [0, 1, 0]);
    },
    getProjectionMatrix(aspect, fovDeg, nearZ, farZ) {
      return mat4.perspective(fovDeg ?? fov, aspect, nearZ ?? near, farZ ?? far);
    },
    /** projection × view for this aspect ratio. */
    getViewProjection(aspect) {
      return mat4.multiply(mat4.perspective(fov, aspect, near, far), mat4.lookAt(getEye(), target, [0, 1, 0]));
    },
    getEye,
    getTarget() {
      return [...target];
    },
    get fov() {
      return fov;
    },
    setTarget(x, y, z) {
      target = Array.isArray(x) ? [...x] : [x, y, z];
    },
    setDistance(d) {
      distance = d;
      clampDistance();
    },
    setRotation(newTheta, newPhi) {
      theta = newTheta;
      phi = newPhi;
      vTheta = vPhi = 0;
      clampPhi();
    },
    zoom(delta) {
      distance *= Math.exp(delta * zoomSpeed);
      clampDistance();
    },
    reset,
  };
}
