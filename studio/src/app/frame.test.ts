import { describe, expect, it } from "vitest";
import { FIT, frameBox, frameLabel, frameResolution, parseFrame, readFrame } from "./frame";

describe("frame", () => {
  it("parses sizes and ratios people type", () => {
    expect(parseFrame("1280x720")).toEqual({ kind: "pixels", width: 1280, height: 720 });
    expect(parseFrame(" 1080 × 1920 ")).toEqual({ kind: "pixels", width: 1080, height: 1920 });
    expect(parseFrame("21:9")).toEqual({ kind: "aspect", w: 21, h: 9 });
    expect(parseFrame("99999x10")).toBeNull();
    expect(parseFrame("wide")).toBeNull();
  });

  it("fits the box inside the available area, centered by the caller", () => {
    expect(frameBox(FIT, { width: 800, height: 600 })).toBeNull();
    expect(frameBox({ kind: "aspect", w: 9, h: 16 }, { width: 800, height: 600 })).toEqual({ width: 337, height: 600 });
    expect(frameBox({ kind: "pixels", width: 1920, height: 1080 }, { width: 800, height: 600 })).toEqual({ width: 800, height: 450 });
  });

  it("only exact sizes set the render resolution", () => {
    expect(frameResolution({ kind: "aspect", w: 1, h: 1 })).toBeNull();
    expect(frameResolution({ kind: "pixels", width: 1080, height: 1080 })).toEqual({ width: 1080, height: 1080 });
    expect(frameLabel({ kind: "pixels", width: 1080, height: 1920 })).toBe("1080×1920");
  });

  it("reads a stored frame defensively", () => {
    expect(readFrame(null)).toEqual(FIT);
    expect(readFrame({ kind: "pixels", width: 99999, height: 2 })).toEqual(FIT);
    expect(readFrame({ kind: "aspect", w: 4, h: 5 })).toEqual({ kind: "aspect", w: 4, h: 5 });
  });
});
