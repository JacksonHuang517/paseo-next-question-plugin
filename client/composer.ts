export interface ComposerTarget {
  agentId: string;
  serverId: string;
}

export interface ComposerHandle {
  getText(): string;
  getInputSnapshot(): unknown;
  replaceText(text: string): void;
  focus(): void;
}

export interface ComposerFiber {
  return?: ComposerFiber | null;
  memoizedProps?: Record<string, unknown> | null;
  ref?: unknown;
  alternate?: ComposerFiber | null;
}

function handleFrom(ref: unknown): ComposerHandle | null {
  if (!ref || typeof ref !== "object" || !("current" in ref)) return null;
  const handle = ref.current as Partial<ComposerHandle> | null;
  return handle &&
    typeof handle.getText === "function" &&
    typeof handle.getInputSnapshot === "function" &&
    typeof handle.replaceText === "function" &&
    typeof handle.focus === "function"
    ? (handle as ComposerHandle)
    : null;
}

// Paseo 0.13 has no public draft API. Only accept the MessageInput handle on
// this textarea's ancestor path, owned by the exact host and agent.
export function findComposerHandle(
  start: ComposerFiber,
  target: ComposerTarget,
): ComposerHandle | null {
  let handle: ComposerHandle | null = null;
  let fiber: ComposerFiber | null | undefined = start;
  for (let depth = 0; fiber && depth < 200; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    handle ??= handleFrom(fiber.ref) ?? handleFrom(props?.ref);
    if (typeof props?.agentId !== "string" || typeof props.serverId !== "string") continue;
    if (props.agentId !== target.agentId || props.serverId !== target.serverId) return null;
    const other = fiber.alternate?.memoizedProps;
    if (other && (other.agentId !== props.agentId || other.serverId !== props.serverId))
      return null;
    return handle;
  }
  return null;
}

export function appendSuggestion(draft: string, suggestion: string): string {
  const text = suggestion.trim();
  if (!text) return draft;
  const trimmed = draft.trimEnd();
  if (!trimmed.trim()) return text;
  if (trimmed === text || trimmed.endsWith(`\n\n${text}`)) return draft;
  return `${trimmed}\n\n${text}`;
}
