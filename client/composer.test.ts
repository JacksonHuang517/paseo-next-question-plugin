import { describe, expect, it } from "vitest";
import { appendSuggestion, type ComposerFiber, findComposerHandle } from "./composer.js";
import { type ComposerDocument, fillWebComposer } from "./web.js";

const target = { agentId: "agent", serverId: "host" };

function fixture(draft = "") {
  const field = {
    value: draft,
    isConnected: true,
    disabled: false,
    readOnly: false,
    parentElement: {
      hidden: false,
      parentElement: null,
      isConnected: true,
      getClientRects: () => ({ length: 1 }),
    },
    getClientRects: () => ({ length: 1 }),
  };
  let focused = false;
  let changes = 0;
  const handle = {
    getText: () => field.value,
    getInputSnapshot: () => ({ text: field.value }),
    replaceText: (text: string) => {
      field.value = text;
      changes++;
    },
    focus: () => {
      focused = true;
    },
  };
  const owner: ComposerFiber = { memoizedProps: { ...target } };
  const fiber: ComposerFiber = { ref: { current: handle }, return: owner };
  const element = Object.assign(field, { __reactFiber$test: fiber });
  const document: ComposerDocument = {
    querySelectorAll: () => [element],
    defaultView: {
      getComputedStyle: (node: unknown) => ({
        display: node === field.parentElement && field.parentElement.hidden ? "none" : "flex",
        visibility: "visible",
      }),
    },
  };
  return { field, fiber, owner, handle, document, focused: () => focused, changes: () => changes };
}

describe("composer insertion", () => {
  it("fills, focuses and preserves the draft, with duplicate clicks idempotent", () => {
    const f = fixture("My draft");
    expect(fillWebComposer(target, "Next?", f.document)).toBe("filled");
    expect(f.field.value).toBe("My draft\n\nNext?");
    expect(f.focused()).toBe(true);
    expect(fillWebComposer(target, "Next?", f.document)).toBe("filled");
    expect(f.changes()).toBe(1);
  });

  it("handles empty and whitespace drafts without stripping meaningful text", () => {
    expect(appendSuggestion("  \n", " Next? ")).toBe("Next?");
    expect(appendSuggestion("My draft\n\nNext?\n", "Next?")).toBe("My draft\n\nNext?\n");
    expect(appendSuggestion("My draft", " ")).toBe("My draft");
  });

  it("rejects other agents, other hosts and stale alternate identities", () => {
    const f = fixture();
    expect(findComposerHandle(f.fiber, { ...target, agentId: "other" })).toBeNull();
    expect(findComposerHandle(f.fiber, { ...target, serverId: "other" })).toBeNull();
    f.owner.alternate = { memoizedProps: { ...target, agentId: "old" } };
    expect(fillWebComposer(target, "Next?", f.document)).toBe("unavailable");
    expect(f.changes()).toBe(0);
  });

  it("ignores hidden, detached, disabled and read-only composers", () => {
    const f = fixture();
    f.field.parentElement.hidden = true;
    expect(fillWebComposer(target, "Next?", f.document)).toBe("unavailable");
    f.field.parentElement.hidden = false;
    for (const key of ["disabled", "readOnly"] as const) {
      f.field[key] = true;
      expect(fillWebComposer(target, "Next?", f.document)).toBe("unavailable");
      f.field[key] = false;
    }
    f.field.isConnected = false;
    expect(fillWebComposer(target, "Next?", f.document)).toBe("unavailable");
    expect(f.changes()).toBe(0);
  });

  it("refuses ambiguous split views and unknown input handles", () => {
    const f = fixture();
    f.document.querySelectorAll = () => [f.field, f.field];
    expect(fillWebComposer(target, "Next?", f.document)).toBe("unavailable");
    f.document.querySelectorAll = () => [f.field];
    f.fiber.ref = { current: { ...f.handle, getInputSnapshot: undefined } };
    expect(fillWebComposer(target, "Next?", f.document)).toBe("unavailable");
  });

  it("refuses an inconsistent draft and reports a failing input handle", () => {
    const f = fixture("Keep this");
    f.handle.getText = () => "Something different";
    expect(fillWebComposer(target, "Next?", f.document)).toBe("unavailable");
    expect(f.field.value).toBe("Keep this");
    f.handle.getText = () => f.field.value;
    f.handle.replaceText = () => {
      throw new Error("unavailable");
    };
    expect(fillWebComposer(target, "Next?", f.document)).toBe("failed");
    expect(f.field.value).toBe("Keep this");
  });
});
