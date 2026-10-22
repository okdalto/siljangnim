import { expect, it } from "vitest";
import { registerAgentSender, sendToExternalAgent } from "./agentHandoff";
it("does not send through a replaced connection and fails explicitly when disconnected", async () => {
  const offOld = registerAgentSender(async () => "old");
  const offNew = registerAgentSender(async () => "new");
  offOld();
  expect(await sendToExternalAgent("blur")).toBe("new");
  offNew();
  await expect(sendToExternalAgent("blur")).rejects.toThrow("Connect this viewer");
});
