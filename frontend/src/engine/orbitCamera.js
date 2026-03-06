/**
 * orbitCamera — Orbit camera controller.
 * Depends on mat4 module for view/projection matrices.
 */

import * as mat4 from "./mat4.js";

export function createOrbitCamera(options = {}) {
  let distance = options.distance ?? 5;
  let theta = options.theta ?? 0;        // horizontal angle (radians)
  let phi = options.phi ?? 0.5;          // vertical angle (radians, 0 = top, PI = bottom)
  let target = options.target ? [...options.target] : [0, 0, 0];
  const damping = options.damping ?? 0.9;
  const zoomSpeed = options.zoomSpeed ?? 0.01;
  const rotateSpeed = options.rotateSpeed ?? 0.005;
  const panSpeed = options.panSpeed ?? 0.01;

  const initDistance = distance;
  const initTheta = theta;
  const initPhi = phi;
  const initTarget = [...target];

  let vTheta = 0, vPhi = 0;

  function clampPhi() {
    phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi));
  }

  function getEye() {
    const sp = Math.sin(phi);
    return [
      target[0] + distance * sp * Math.sin(theta),
      target[1] + distance * Math.cos(phi),
      target[2] + distance * sp * Math.cos(theta),
    ];
  }

  return {
    update(mouse, mousePrev, mouseDown, keys, dt) {
      if (mouseDown) {
        const dx = (mouse[0] - mousePrev[0]);
        const dy = (mouse[1] - mousePrev[1]);

        if (keys && (keys.has("ShiftLeft") || keys.has("ShiftRight"))) {
          // Pan
          const right = [Math.cos(theta), 0, -Math.sin(theta)];
          const up = [0, 1, 0];
          const panScale = distance * panSpeed;
          target[0] -= right[0] * dx * panScale - up[0] * dy * panScale;
          target[1] -= right[1] * dx * panScale - up[1] * dy * panScale;
          target[2] -= right[2] * dx * panScale - up[2] * dy * panScale;
        } else {
          // Rotate
          vTheta += dx * rotateSpeed;
          vPhi += dy * rotateSpeed;
        }
      }

      // Apply velocity with damping
      theta += vTheta;
      phi += vPhi;
      vTheta *= damping;
      vPhi *= damping;
      clampPhi();

      // Zoom with scroll (via keys for now — use mousewheel in script if needed)
      if (keys) {
        if (keys.has("Equal") || keys.has("NumpadAdd")) {
          distance *= 1 - zoomSpeed * 5;
        }
        if (keys.has("Minus") || keys.has("NumpadSubtract")) {
          distance *= 1 + zoomSpeed * 5;
        }
      }
      distance = Math.max(0.1, distance);
    },

    getViewMatrix() {
      return mat4.lookAt(getEye(), target, [0, 1, 0]);
    },

    getProjectionMatrix(aspect, fov, near, far) {
      return mat4.perspective(fov ?? 60, aspect, near ?? 0.1, far ?? 1000);
    },

    getEye() {
      return getEye();
    },

    setTarget(x, y, z) {
      target = [x, y, z];
    },

    setDistance(d) {
      distance = Math.max(0.1, d);
    },

    setRotation(newTheta, newPhi) {
      theta = newTheta;
      phi = newPhi;
      vTheta = 0;
      vPhi = 0;
      clampPhi();
    },

    zoom(delta) {
      distance *= 1 + delta * zoomSpeed;
      distance = Math.max(0.1, distance);
    },

    reset() {
      distance = initDistance;
      theta = initTheta;
      phi = initPhi;
      target = [...initTarget];
      vTheta = 0;
      vPhi = 0;
    },
  };
}
