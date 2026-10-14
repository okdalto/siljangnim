import { describe, expect, it } from "vitest";
import { createPlaneGeometry as plane, createSphereGeometry as sphere } from "./geometries.js";

describe("geometry indices", () => {
  it("stay 16-bit for small meshes and switch to 32-bit past 65535 vertices", () => {
    expect(plane(2, 2, 64, 64).indices).toBeInstanceOf(Uint16Array);
    const fine = plane(2, 2, 512, 512);
    expect(fine.indices).toBeInstanceOf(Uint32Array);
    expect(Math.max(...fine.indices.slice(-6))).toBe(513 * 513 - 1);
    expect(sphere(32).indices).toBeInstanceOf(Uint16Array);
  });
});
