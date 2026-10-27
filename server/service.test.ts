import type { PaseoApi } from "@getpaseo/client";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "./context.js";
import { createSuggestionService } from "./service.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const api = {} as PaseoApi;
const messages: Message[] = [
  { role: "user", text: "What next?" },
  { role: "assistant", text: "Done." },
];
const source = { epoch: "epoch-1", seqEnd: 8 };

describe("suggestion service", () => {
  it("surfaces generation failures and allows retrying the same source", async () => {
    const generate = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("Suggestion generation timed out"))
      .mockResolvedValueOnce("What should we verify next?");
    const service = createSuggestionService(api, generate, async () => messages);
    await expect(service.resolve({ agentId: "a", source, requestId: "r1" })).rejects.toThrow(
      "Suggestion generation timed out",
    );
    await expect(service.resolve({ agentId: "a", source, requestId: "r2" })).resolves.toEqual({
      source,
      suggestion: "What should we verify next?",
    });
    expect(generate).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it("deduplicates concurrent consumers and caches a validated source", async () => {
    const completion = deferred<string | null>();
    const generate = vi.fn(() => completion.promise);
    const read = vi.fn(async () => messages);
    const service = createSuggestionService(api, generate, read);
    const first = service.resolve({ agentId: "a", source, requestId: "r1" });
    const second = service.resolve({ agentId: "a", source, requestId: "r2" });
    completion.resolve("What should we verify next?");
    expect(await first).toEqual({ source, suggestion: "What should we verify next?" });
    expect(await second).toEqual({ source, suggestion: "What should we verify next?" });
    expect(await service.resolve({ agentId: "a", source, requestId: "r3" })).toEqual({
      source,
      suggestion: "What should we verify next?",
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(3);
    service.dispose();
  });

  it("cancels only the final consumer and discards its result", async () => {
    const completion = deferred<string | null>();
    let generationSignal: AbortSignal | undefined;
    const service = createSuggestionService(
      api,
      (_, signal) => {
        generationSignal = signal;
        return completion.promise;
      },
      async () => messages,
    );
    const first = service.resolve({ agentId: "a", source, requestId: "r1" });
    const second = service.resolve({ agentId: "a", source, requestId: "r2" });
    await Promise.resolve();
    expect(service.cancel("r1")).toBe(true);
    expect(generationSignal?.aborted).toBe(false);
    expect(service.cancel("r2")).toBe(true);
    expect(generationSignal?.aborted).toBe(true);
    completion.resolve("Old question?");
    expect(await first).toEqual({ source, suggestion: null });
    expect(await second).toEqual({ source, suggestion: null });
    service.dispose();
  });

  it("discards a generated result when the source changes during generation", async () => {
    const completion = deferred<string | null>();
    const read = vi.fn(async () => (read.mock.calls.length === 1 ? messages : null));
    const service = createSuggestionService(api, () => completion.promise, read);
    const result = service.resolve({ agentId: "a", source, requestId: "r1" });
    completion.resolve("Stale question?");
    expect(await result).toEqual({ source, suggestion: null });
    service.dispose();
  });

  it("cancels an in-flight suggestion when the agent starts another turn", async () => {
    const completion = deferred<string | null>();
    let generationSignal: AbortSignal | undefined;
    const service = createSuggestionService(
      api,
      (_, signal) => {
        generationSignal = signal;
        return completion.promise;
      },
      async () => messages,
    );
    const result = service.resolve({ agentId: "a", source, requestId: "r1" });
    await Promise.resolve();
    service.cancelAgent("a");
    expect(generationSignal?.aborted).toBe(true);
    completion.resolve("Old question?");
    expect(await result).toEqual({ source, suggestion: null });
    service.dispose();
  });
});
