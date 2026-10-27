import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SuggestionRow } from "./client/suggestion-row.js";
import { showSuggestionRpc } from "./shared/rpc.js";
import { ROW_KIND, suggestionRowSchema } from "./shared/ui.js";

export default function contribute(client: PluginClientContext) {
  const removers = [
    client.addTimelineRenderer({
      kind: ROW_KIND,
      version: 1,
      schema: suggestionRowSchema,
      Component: SuggestionRow,
    }),
    client.addSlashCommand({
      name: "next-question",
      description: "Suggest one follow-up to the latest completed reply",
      argumentHint: "",
      context: "agent",
      async onSubmit({ agent, rpc }) {
        const result = await rpc(showSuggestionRpc, { agentId: agent.id });
        if (!result.shown)
          throw new Error("Wait for a completed reply before asking for a suggestion.");
      },
    }),
  ];
  return () => {
    for (const remove of removers) remove();
  };
}
