import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useAgent, useRpc } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { z } from "zod";
import { cancelSuggestionRpc, resolveSuggestionRpc, sendSuggestionRpc } from "../shared/rpc.js";
import type { suggestionRowSchema } from "../shared/ui.js";

let counter = 0;
const instanceId = Math.random().toString(36).slice(2);

export function SuggestionRow({
  agentId,
  item,
  theme,
  layout,
}: PluginTimelineItemProps<z.infer<typeof suggestionRowSchema>>) {
  const resolve = useRpc(resolveSuggestionRpc);
  const cancel = useRpc(cancelSuggestionRpc);
  const send = useRpc(sendSuggestionRpc);
  const status = useAgent(agentId, (agent) => agent.status);
  const [text, setText] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error" | "sending" | "sent">(
    "loading",
  );
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [note, setNote] = useState("");
  const [retry, setRetry] = useState(0);
  const { epoch, seqEnd } = item.data.source;

  useEffect(() => {
    if (status !== "idle" || dismissed) return;
    let active = true;
    const requestId = `${instanceId}-${retry}-${++counter}`;
    setState("loading");
    resolve({ agentId, source: { epoch, seqEnd }, requestId })
      .then((result) => {
        if (!active) return;
        setText(result.suggestion ?? "");
        setState(result.suggestion ? "ready" : "empty");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
      void cancel({ requestId }).catch(() => {});
    };
  }, [agentId, epoch, seqEnd, status, retry, dismissed, resolve, cancel]);

  if (dismissed || status !== "idle" || state === "empty" || state === "sent") return null;
  const label = { color: theme.colors.foregroundMuted, fontSize: 12 };
  const button = {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.surface2,
  };
  const action = (title: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      style={button}
    >
      <Text
        style={{
          color: disabled ? theme.colors.foregroundMuted : theme.colors.foreground,
          fontSize: 12,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
  async function copy() {
    try {
      await copyText(text);
      setNote("Copied");
    } catch {
      setNote("Could not copy. Select the text to copy it.");
    }
  }
  async function submit() {
    if (state !== "ready" || !text.trim()) return;
    setState("sending");
    setNote("");
    try {
      const result = await send({ agentId, source: { epoch, seqEnd }, text: text.trim() });
      setState(result.sent ? "sent" : "empty");
    } catch {
      setState("ready");
      setNote("Send could not be confirmed. Check the conversation before trying again.");
    }
  }
  return (
    <View
      style={{
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: layout.compact ? 10 : 14,
        borderLeftWidth: 2,
        borderLeftColor: theme.colors.border,
      }}
    >
      <Text style={label}>Next question</Text>
      {state === "loading" ? <Text style={label}>Thinking of a useful follow-up…</Text> : null}
      {state === "error" ? (
        <Text style={label}>
          Suggestion unavailable. Check that Codex is installed and signed in.
        </Text>
      ) : null}
      {state === "ready" || state === "sending" ? (
        <>
          {editing ? (
            <TextInput
              accessibilityLabel="Edit next question"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              editable={state === "ready"}
              style={{
                color: theme.colors.foreground,
                backgroundColor: theme.colors.surface1,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 6,
                padding: 10,
                minHeight: 64,
                fontSize: 14,
              }}
            />
          ) : (
            <Text
              selectable
              style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 21 }}
            >
              {text}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {!editing
              ? action("Edit", () => setEditing(true))
              : action(
                  state === "sending" ? "Sending…" : "Send question",
                  () => {
                    void submit();
                  },
                  state === "sending" || !text.trim(),
                )}
            {action(
              "Copy",
              () => {
                void copy();
              },
              state === "sending",
            )}
            {action("Dismiss", () => setDismissed(true), state === "sending")}
          </View>
        </>
      ) : null}
      {state === "error" ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {action("Retry", () => setRetry((value) => value + 1))}
          {action("Dismiss", () => setDismissed(true))}
        </View>
      ) : null}
      {note ? <Text style={label}>{note}</Text> : null}
      {editing ? (
        <Text style={label}>
          Sends only when you press “Send question”. Your composer draft stays unchanged.
        </Text>
      ) : null}
    </View>
  );
}
