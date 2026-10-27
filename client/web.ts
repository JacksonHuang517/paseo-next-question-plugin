import {
  appendSuggestion,
  type ComposerFiber,
  type ComposerTarget,
  findComposerHandle,
} from "./composer.js";

// Deliberately local DOM shapes: this module is only called on web, and the
// plugin's shared/native compilation does not include the DOM type library.
interface WebElement {
  isConnected: boolean;
  parentElement: WebElement | null;
  getClientRects(): { length: number };
}

interface WebField extends WebElement {
  value: string;
  disabled: boolean;
  readOnly: boolean;
}

export interface ComposerDocument {
  querySelectorAll(selector: string): ArrayLike<WebField>;
  defaultView: {
    getComputedStyle(element: WebElement): { display: string; visibility: string };
  } | null;
}

function visible(field: WebField, document: ComposerDocument): boolean {
  if (!field.isConnected || !field.getClientRects().length || !document.defaultView) return false;
  for (let node: WebElement | null = field; node; node = node.parentElement) {
    const style = document.defaultView.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    )
      return false;
  }
  return true;
}

function fiberOf(field: WebField): ComposerFiber | null {
  const key = Object.keys(field).find((key) => key.startsWith("__reactFiber$"));
  return key ? ((field as unknown as Record<string, unknown>)[key] as ComposerFiber) : null;
}

export type FillResult = "filled" | "unavailable" | "failed";

export function fillWebComposer(
  target: ComposerTarget,
  suggestion: string,
  document = (globalThis as unknown as { document?: ComposerDocument }).document,
): FillResult {
  if (!document || !suggestion.trim()) return "unavailable";
  try {
    const matches = Array.from(
      document.querySelectorAll('[data-testid="message-input-root"] textarea[data-composer-input]'),
    ).flatMap((field) => {
      if (field.disabled || field.readOnly || !visible(field, document)) return [];
      const fiber = fiberOf(field);
      const handle = fiber && findComposerHandle(fiber, target);
      return handle ? [{ field, handle }] : [];
    });
    // Split views can contain two composers for the same agent. Never guess.
    if (matches.length !== 1) return "unavailable";
    const { field, handle } = matches[0];
    const draft = handle.getText();
    if (draft !== field.value) return "unavailable";
    const next = appendSuggestion(draft, suggestion);
    if (next !== draft) handle.replaceText(next);
    if (handle.getText() !== next || field.value !== next) return "failed";
    handle.focus();
    return "filled";
  } catch {
    return "failed";
  }
}
