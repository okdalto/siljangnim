import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleReady } from "../src/smokeReadiness.js";

test("visible pixels do not finish an example check while its setup is loading", () => {
  const pixels = { litFraction: 0.57 };
  assert.equal(exampleReady({ state: "loading", errors: 0 }, pixels), false);
  assert.equal(exampleReady({ state: "running", errors: 0, galleryOpen: true }, pixels), false);
  assert.equal(exampleReady({ state: "running", errors: 0, galleryOpen: false }, pixels), true);
});

test("readiness still requires visible output and no runtime errors", () => {
  assert.equal(exampleReady({ state: "running", errors: 1 }, { litFraction: 1 }), false);
  assert.equal(exampleReady({ state: "running", errors: 0 }, { litFraction: 0 }), false);
  assert.equal(exampleReady({ state: "running", errors: 0 }, null), false);
});
