import { describe, expect, it } from "vitest";
import { parseCodexOutput } from "./generate.js";

describe("Codex suggestion output", () => {
  it("accepts the final structured assistant message", () => {
    const stdout = [
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: '{"suggestion":"First?"}' },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: '{"suggestion":"Next step?"}' },
      }),
    ].join("\n");
    expect(parseCodexOutput(stdout)).toBe("Next step?");
  });

  it("returns null for empty, malformed, or multiline suggestions", () => {
    for (const text of ['{"suggestion":null}', "not-json", '{"suggestion":"First?\\nSecond?"}']) {
      expect(
        parseCodexOutput(
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }),
        ),
      ).toBeNull();
    }
  });
});
