import { describe, expect, it } from "vitest";
import { createOrbitCamera } from "./orbitCamera.js";

type Vec = [number, number, number, number];
const keys = new Set<string>();

type V3 = [number, number, number];
const eye = (cam: { getEye(): number[] }) => cam.getEye() as V3;
const target = (cam: { getTarget(): number[] }) => cam.getTarget() as V3;

function setup() {
  const pointer = { wheel: 0, buttons: 0, doubleClick: false };
  const cam = createOrbitCamera({ distance: 5, theta: 0, phi: 1.2, pointer });
  const drag = (dx: number, dy: number, buttons: number, held = keys) => {
    pointer.buttons = buttons;
    const prev: Vec = [0.5, 0.5, 0.5, 0.5];
    const now: Vec = [0.5 + dx, 0.5 + dy, 0.5, 0.5];
    cam.update(now, prev, true, held, 1 / 60);
    pointer.buttons = 0;
  };
  return { pointer, cam, drag };
}

describe("orbit camera", () => {
  it("turns a useful amount when dragged across part of the viewport", () => {
    const { cam, drag } = setup();
    const before = eye(cam);
    drag(0.25, 0, 1);
    const after = eye(cam);
    // A quarter of the viewport turns it by about a radian.
    const angle = Math.acos((before[0] * after[0] + before[2] * after[2]) / (Math.hypot(before[0], before[2]) * Math.hypot(after[0], after[2])));
    expect(angle).toBeGreaterThan(0.8);
  });

  it("pans with the right button or Shift, zooms with the wheel, and resets on double-click", () => {
    const { pointer, cam, drag } = setup();
    drag(0.1, 0, 2);
    expect(target(cam)[0]).not.toBeCloseTo(0);
    drag(0, 0.1, 1, new Set(["ShiftLeft"]));
    expect(target(cam)[1]).not.toBeCloseTo(0);
    const far = Math.hypot(...eye(cam).map((v, i) => v - target(cam)[i]!));
    pointer.wheel = -400;
    cam.update([0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], false, keys, 1 / 60);
    pointer.wheel = 0;
    const near = Math.hypot(...eye(cam).map((v, i) => v - target(cam)[i]!));
    expect(near).toBeLessThan(far * 0.7);
    pointer.doubleClick = true;
    cam.update([0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], false, keys, 1 / 60);
    expect(cam.getTarget()).toEqual([0, 0, 0]);
  });

  it("keeps turning a little after letting go, then stops", () => {
    const { cam, drag } = setup();
    drag(0.05, 0, 1);
    const a = eye(cam);
    cam.update([0.55, 0.5, 0.5, 0.5], [0.55, 0.5, 0.5, 0.5], false, keys, 1 / 60);
    const b = eye(cam);
    expect(b[0]).not.toBeCloseTo(a[0], 4);
    for (let i = 0; i < 300; i++) cam.update([0.55, 0.5, 0.5, 0.5], [0.55, 0.5, 0.5, 0.5], false, keys, 1 / 60);
    const c = eye(cam);
    cam.update([0.55, 0.5, 0.5, 0.5], [0.55, 0.5, 0.5, 0.5], false, keys, 1 / 60);
    expect(eye(cam)[0]).toBeCloseTo(c[0], 6);
  });
});

describe("portrait framing", () => {
  it("keeps the vertical fov in landscape and widens it in portrait so the sides stay in view", () => {
    const cam = createOrbitCamera({ fov: 45 });
    expect(cam.fovFor(16 / 9)).toBe(45);
    const tallFov = cam.fovFor(9 / 16);
    // Horizontal half-angle in portrait equals the vertical half-angle of a square frame.
    expect(Math.tan((tallFov * Math.PI) / 360) * (9 / 16)).toBeCloseTo(Math.tan((45 * Math.PI) / 360), 6);
    // An explicit fov is used as given.
    expect(cam.getProjectionMatrix(9 / 16, 30)[5]).toBeCloseTo(1 / Math.tan((30 * Math.PI) / 360), 6);
  });
});
