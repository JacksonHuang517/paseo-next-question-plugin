import type { PluginHandlerContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHandlerContext["paseo"];

import type { z } from "zod";
import type { sourceSchema } from "../shared/rpc.js";

export type Source = z.infer<typeof sourceSchema>;

export interface Message {
  role: "user" | "assistant";
  text: string;
}

export async function readRecentContext(
  paseo: PaseoApi,
  agentId: string,
  source: Source,
): Promise<Message[] | null> {
  const page = await paseo.agents.ref(agentId).timeline.refetch({
    direction: "tail",
    projection: "canonical",
    limit: 80,
  });
  if (page.error || page.epoch !== source.epoch || page.hasNewer || page.agent?.status !== "idle")
    return null;
  if (page.agent.activeTurn) return null;

  const messages = page.entries.flatMap((entry) => {
    if (entry.item.type !== "user_message" && entry.item.type !== "assistant_message") return [];
    const text = entry.item.text.trim();
    const role: Message["role"] = entry.item.type === "user_message" ? "user" : "assistant";
    return text ? [{ role, text, seqEnd: entry.seqEnd }] : [];
  });
  const latest = messages.at(-1);
  if (latest?.role !== "assistant" || latest.seqEnd !== source.seqEnd) return null;
  if (!messages.some((message) => message.role === "user")) return null;

  const recent = messages.slice(-8).map(({ role, text }) => ({ role, text }));
  let remaining = 6_000;
  const bounded: Message[] = [];
  for (let index = recent.length - 1; index >= 0 && remaining > 0; index--) {
    const message = recent[index];
    if (!message) continue;
    const text = message.text.slice(-Math.min(remaining, 3_000));
    bounded.unshift({ role: message.role, text });
    remaining -= text.length;
  }
  return bounded;
}

export function sourceKey(source: Source): string {
  return `${source.epoch}:${source.seqEnd}`;
}

export async function readLatestSource(paseo: PaseoApi, agentId: string): Promise<Source | null> {
  const page = await paseo.agents.ref(agentId).timeline.refetch({
    direction: "tail",
    projection: "canonical",
    limit: 80,
  });
  if (page.error || page.hasNewer || page.agent?.status !== "idle" || page.agent.activeTurn)
    return null;
  const messages = page.entries.filter(
    ({ item }) => item.type === "user_message" || item.type === "assistant_message",
  );
  const latest = messages.at(-1);
  if (!page.epoch || latest?.item.type !== "assistant_message" || !latest.item.text.trim())
    return null;
  if (!messages.some(({ item }) => item.type === "user_message")) return null;
  return { epoch: page.epoch, seqEnd: latest.seqEnd };
}
