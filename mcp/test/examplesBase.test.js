import assert from "node:assert/strict";
import { test } from "node:test";
import { examplesBase } from "../scripts/examplesBase.mjs";

test("points the package at the commit's examples on GitHub", () => {
  assert.equal(examplesBase({ sha: "abc123", dirty: "" }), "https://raw.githubusercontent.com/okdalto/siljangnim/abc123/examples");
});

test("an explicit base wins, and local bundles the files", () => {
  assert.equal(examplesBase({ env: "https://example.org/ex", sha: "abc", dirty: " M examples/a" }), "https://example.org/ex");
  assert.equal(examplesBase({ env: "local", sha: "abc", dirty: " M examples/a" }), null);
});

test("refuses uncommitted examples, whose hashes would not match GitHub", () => {
  assert.throws(() => examplesBase({ sha: "abc", dirty: "?? examples/new/" }), /uncommitted changes[\s\S]*examples\/new/);
});
