import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE } from "../scene/schema";
import { mixRequest } from "./mix";

describe("mixRequest", () => {
  it("carries the other scene and says where its assets went", () => {
    const text = mixRequest("Stellar flyby", DEFAULT_SCENE, new Map([["orbits.json", "orbits-2.json"], ["beat.wav", "beat.wav"]]));
    expect(text).toContain('"Stellar flyby"');
    expect(text).toContain("orbits.json is orbits-2.json here");
    expect(text).not.toContain("beat.wav is");
    expect(JSON.parse(text.slice(text.indexOf("```json") + 7, text.lastIndexOf("```")))).toEqual(DEFAULT_SCENE);
  });

  it("says nothing about assets when there are none", () => {
    expect(mixRequest("Waves", DEFAULT_SCENE, new Map())).not.toContain("assets");
  });
});
