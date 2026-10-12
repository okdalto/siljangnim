import assert from "node:assert/strict";
import { it } from "node:test";
import { CallTracker } from "../src/calls.js";

it("returns fast results directly and releases their slots", async () => {
  const calls = new CallTracker({ waitMs: 5, maxEntries: 1 });
  for (let i = 0; i < 3; i++) assert.deepEqual(await calls.start("read", async () => ({ content: "ok" })), { content: "ok" });
});

it("resumes slow setup/approval/work without repeating the operation and preserves images", async () => {
  const calls = new CallTracker({ waitMs: 5 });
  let finish;
  let runs = 0;
  const result = await calls.start("python_run", () => {
    runs++;
    return new Promise((resolve) => { finish = resolve; });
  });
  const id = result.content.match(/call_id "([^"]+)"/)[1];
  assert.equal(result.isError, undefined);
  assert.match((await calls.poll(id)).content, /still pending/);
  const output = { content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }] };
  finish(output);
  assert.deepEqual(await calls.poll(id), output);
  assert.deepEqual(await calls.poll(id), output);
  assert.equal(runs, 1);
});

it("retains late errors and rejects unknown or expired IDs", async () => {
  const calls = new CallTracker({ waitMs: 5, retentionMs: 10 });
  let fail;
  const pending = await calls.start("write", () => new Promise((_, reject) => { fail = reject; }));
  const id = pending.content.match(/call_id "([^"]+)"/)[1];
  fail(new Error("viewer disconnected"));
  assert.deepEqual(await calls.poll(id), { isError: true, content: "viewer disconnected" });
  assert.equal((await calls.poll("wrong")).isError, true);
  assert.equal((await calls.poll(null)).isError, true);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.match((await calls.poll(id)).content, /expired/);
});

it("refuses excess work before it starts", async () => {
  const calls = new CallTracker({ waitMs: 5, maxEntries: 1 });
  await calls.start("pending", () => new Promise(() => {}));
  let ran = false;
  const output = await calls.start("extra", () => { ran = true; });
  assert.equal(output.isError, true);
  assert.equal(ran, false);
  calls.clear();
});
