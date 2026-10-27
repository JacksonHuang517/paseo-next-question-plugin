import type { PluginHandlerContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHandlerContext["paseo"];

import { readRecentContext, type Source, sourceKey } from "./context.js";

/** Claim a source before awaiting the send, so double clicks and other clients cannot resend it. */
export function createSender(paseo: PaseoApi, read = readRecentContext) {
  const sent = new Set<string>();
  return async ({ agentId, source, text }: { agentId: string; source: Source; text: string }) => {
    const key = `${agentId}:${sourceKey(source)}`;
    if (sent.has(key) || !(await read(paseo, agentId, source))) return { sent: false };
    if (sent.has(key)) return { sent: false };
    sent.add(key);
    // Keep the claim even if transport fails after the daemon accepted the message.
    await paseo.agents.ref(agentId).send(text);
    if (sent.size > 1000) {
      const oldest = sent.values().next().value;
      if (oldest !== undefined) sent.delete(oldest);
    }
    return { sent: true };
  };
}
