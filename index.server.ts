import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readLatestSource, sourceKey } from "./server/context.js";
import { createSender } from "./server/send.js";
import { createSuggestionService } from "./server/service.js";
import {
  cancelSuggestionRpc,
  resolveSuggestionRpc,
  sendSuggestionRpc,
  showSuggestionRpc,
  validateSuggestionRpc,
} from "./shared/rpc.js";
import { ROW_KIND } from "./shared/ui.js";

export default function contribute(server: PluginServerContext) {
  let service: ReturnType<typeof createSuggestionService> | null = null;
  let sender: ReturnType<typeof createSender> | null = null;
  server.handle(resolveSuggestionRpc, (input, { paseo }) => {
    service ??= createSuggestionService(paseo);
    return service.resolve(input);
  });
  server.handle(cancelSuggestionRpc, ({ requestId }) => ({
    canceled: service?.cancel(requestId) ?? false,
  }));
  server.handle(sendSuggestionRpc, (input, { paseo }) => {
    sender ??= createSender(paseo);
    return sender(input);
  });
  server.handle(validateSuggestionRpc, async ({ agentId, source }, { paseo }) => {
    const latest = await readLatestSource(paseo, agentId);
    return { current: latest !== null && sourceKey(latest) === sourceKey(source) };
  });
  server.handle(showSuggestionRpc, async ({ agentId }, { paseo }) => {
    const source = await readLatestSource(paseo, agentId);
    if (!source) return { shown: false };
    await paseo.agents.ref(agentId).timeline.append({
      type: "plugin",
      id: `next-question-${sourceKey(source)}`,
      kind: ROW_KIND,
      version: 1,
      data: { source },
    });
    return { shown: true };
  });
  const removers = [
    server.on("agent.turn_ended", async (event, { paseo }) => {
      if (event.outcome.kind !== "completed" || event.agent.parentAgentId) return;
      const source = await readLatestSource(paseo, event.agent.id);
      if (!source) return;
      // Append a slot only. The model runs when a connected client mounts this row.
      await paseo.agents.ref(event.agent.id).timeline.append({
        type: "plugin",
        id: `next-question-${sourceKey(source)}`,
        kind: ROW_KIND,
        version: 1,
        data: { source },
      });
    }),
    server.on("agent.turn_started", ({ agent }) => service?.cancelAgent(agent.id)),
    server.on("agent.closed", ({ agent }) => service?.cancelAgent(agent.id)),
    server.on("agent.archived", ({ agent }) => service?.cancelAgent(agent.id)),
  ];
  return () => {
    for (const remove of removers) remove();
    service?.dispose();
  };
}
