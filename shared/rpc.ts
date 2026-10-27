import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const sourceSchema = z.object({
  epoch: z.string().min(1),
  seqEnd: z.number().int().nonnegative(),
});

export const resolveSuggestionRpc = defineRpc({
  name: "suggestion.resolve",
  input: z.object({
    agentId: z.string().min(1),
    source: sourceSchema,
    requestId: z.string().min(1),
  }),
  output: z.object({ source: sourceSchema, suggestion: z.string().nullable() }),
});

export const cancelSuggestionRpc = defineRpc({
  name: "suggestion.cancel",
  input: z.object({ requestId: z.string().min(1) }),
  output: z.object({ canceled: z.boolean() }),
});

export const showSuggestionRpc = defineRpc({
  name: "suggestion.show",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({ shown: z.boolean() }),
});

export const sendSuggestionRpc = defineRpc({
  name: "suggestion.send",
  input: z.object({
    agentId: z.string().min(1),
    source: sourceSchema,
    text: z.string().trim().min(1).max(2000),
  }),
  output: z.object({ sent: z.boolean() }),
});
