import type { PaseoApi } from "@getpaseo/client";
import { describe, expect, it } from "vitest";
import { readLatestSource, readRecentContext } from "./context.js";

const source = { epoch: "epoch-1", seqEnd: 4 };

function api(overrides: Record<string, unknown> = {}): PaseoApi {
  const page = {
    error: null,
    epoch: "epoch-1",
    hasNewer: false,
    agent: { status: "idle", activeTurn: null },
    entries: [
      { seqEnd: 1, item: { type: "user_message", text: "First question" } },
      { seqEnd: 2, item: { type: "assistant_message", text: "First answer" } },
      { seqEnd: 3, item: { type: "user_message", text: "Second question" } },
      { seqEnd: 4, item: { type: "assistant_message", text: "Second answer" } },
    ],
    ...overrides,
  };
  return {
    agents: { ref: () => ({ timeline: { refetch: async () => page } }) },
  } as unknown as PaseoApi;
}

describe("recent suggestion context", () => {
  it("reads only messages ending at the completed assistant source", async () => {
    expect(await readRecentContext(api(), "agent-1", source)).toEqual([
      { role: "user", text: "First question" },
      { role: "assistant", text: "First answer" },
      { role: "user", text: "Second question" },
      { role: "assistant", text: "Second answer" },
    ]);
  });

  it("rejects stale source and running turns", async () => {
    expect(await readRecentContext(api({ epoch: "epoch-2" }), "agent-1", source)).toBeNull();
    expect(
      await readRecentContext(
        api({ agent: { status: "running", activeTurn: {} } }),
        "agent-1",
        source,
      ),
    ).toBeNull();
    expect(await readRecentContext(api(), "agent-1", { ...source, seqEnd: 2 })).toBeNull();
  });
});

describe("latest reply and context limits", () => {
  it("does not generate for a conversation without a user message", async () => {
    const client = api({
      entries: [{ seqEnd: 4, item: { type: "assistant_message", text: "Done" } }],
    });
    expect(await readLatestSource(client, "a")).toBeNull();
    expect(await readRecentContext(client, "a", source)).toBeNull();
  });
  it("returns the current cursor and ignores plugin rows", async () => {
    expect(await readLatestSource(api(), "a")).toEqual(source);
  });
  it("keeps only bounded message text and excludes tool output", async () => {
    const entries = [{ seqEnd: 0, item: { type: "tool_call", text: "DO NOT INCLUDE" } }];
    for (let i = 1; i <= 12; i++)
      entries.push({
        seqEnd: i,
        item: { type: i % 2 ? "user_message" : "assistant_message", text: "x".repeat(5000) },
      });
    const result = await readRecentContext(api({ entries }), "a", { epoch: "epoch-1", seqEnd: 12 });
    expect(result).not.toBeNull();
    expect(result?.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(6000);
    expect(result?.every((item) => item.text.length <= 3000)).toBe(true);
    expect(result?.some((item) => item.text.includes("DO NOT INCLUDE"))).toBe(false);
  });
});
