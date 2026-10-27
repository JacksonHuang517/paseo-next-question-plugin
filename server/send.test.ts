import type { PaseoApi } from "@getpaseo/client";
import { describe, expect, it, vi } from "vitest";
import { createSender } from "./send.js";

const source = { epoch: "test", seqEnd: 2 };
const request = { agentId: "a", source, text: "What should we check next?" };
function mockApi(send = vi.fn(async () => {})) {
  return { api: { agents: { ref: () => ({ send }) } } as unknown as PaseoApi, send };
}

describe("explicit suggestion sending", () => {
  it("rejects stale sources without posting", async () => {
    const { api, send } = mockApi();
    expect(await createSender(api, async () => null)(request)).toEqual({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("sends the user-edited text once across concurrent clients", async () => {
    const { api, send } = mockApi();
    const sender = createSender(api, async () => [{ role: "assistant", text: "Done" }]);
    const results = await Promise.all([sender(request), sender(request)]);
    expect(results.filter((result) => result.sent)).toHaveLength(1);
    expect(send).toHaveBeenCalledExactlyOnceWith(request.text);
  });
  it("does not resend after an ambiguous transport failure", async () => {
    const { api, send } = mockApi(
      vi.fn(async () => {
        throw new Error("Disconnected");
      }),
    );
    const sender = createSender(api, async () => [{ role: "assistant", text: "Done" }]);
    await expect(sender(request)).rejects.toThrow("Disconnected");
    expect(await sender(request)).toEqual({ sent: false });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
