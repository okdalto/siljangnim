import assert from "node:assert/strict";
import { test } from "node:test";
import { queueCodexMessage } from "../src/codexQueue.js";
const thread = "01234567-89ab-4def-8123-456789abcdef";
test("queues literal text to an exact thread without a shell", async () => {
  const text = 'Motion blur; $(touch /tmp/never) "한글"\nnext line';
  await queueCodexMessage(thread, text, async (_bin, args, options) => {
    assert.deepEqual(args, ["queue", "--thread", thread, "--message", text]);
    assert.equal(options.shell, undefined);
    assert.equal(options.timeout, 15000);
  });
});
test("rejects ambiguous targets and oversized messages before spawning", async () => {
  const never = async () => assert.fail("must not execute");
  await assert.rejects(queueCodexMessage("latest", "hi", never));
  await assert.rejects(queueCodexMessage(thread, " ", never));
  await assert.rejects(queueCodexMessage(thread, "한".repeat(6000), never));
});
test("never claims delivery on timeout and never automatically retries", async () => {
  let calls = 0;
  await assert.rejects(queueCodexMessage(thread, "hi", async () => { calls++; throw new Error("timeout"); }), /Check the target chat/);
  assert.equal(calls, 1);
});
