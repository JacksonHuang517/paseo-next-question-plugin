import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useAgent, useRpc } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import type { z } from "zod";
import {
  cancelSuggestionRpc,
  resolveSuggestionRpc,
  sendSuggestionRpc,
  validateSuggestionRpc,
} from "../shared/rpc.js";
import type { suggestionRowSchema } from "../shared/ui.js";
import { fillWebComposer } from "./web.js";

let counter = 0;
const instanceId = Math.random().toString(36).slice(2);

export function SuggestionRow({
  agentId,
  item,
  theme,
  layout,
  host,
}: PluginTimelineItemProps<z.infer<typeof suggestionRowSchema>>) {
  const resolve = useRpc(resolveSuggestionRpc);
  const cancel = useRpc(cancelSuggestionRpc);
  const send = useRpc(sendSuggestionRpc);
  const validate = useRpc(validateSuggestionRpc);
  const status = useAgent(agentId, (agent) => agent.status);
  const [text, setText] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error" | "sending" | "sent">(
    "loading",
  );
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [note, setNote] = useState("");
  const [retry, setRetry] = useState(0);
  const [filling, setFilling] = useState(false);
  const fillPending = useRef(false);
  const activeRow = useRef("");
  const { epoch, seqEnd } = item.data.source;
  const rowKey = `${host.id}:${agentId}:${epoch}:${seqEnd}`;
  activeRow.current = status === "idle" && !dismissed ? rowKey : "";
  const canFill = Platform.OS === "web" && layout.platform === "web";

  useEffect(
    () => () => {
      activeRow.current = "";
    },
    [],
  );

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
  async function fill() {
    if (!canFill || state !== "ready" || fillPending.current || !text.trim()) return;
    fillPending.current = true;
    setFilling(true);
    setNote("");
    try {
      const result = await validate({ agentId, source: { epoch, seqEnd } });
      if (activeRow.current !== rowKey) return;
      if (!result.current) {
        setNote("This suggestion is out of date. Use /next-question for the latest reply.");
        return;
      }
      const outcome = fillWebComposer({ agentId, serverId: host.id }, text);
      setNote(
        outcome === "filled"
          ? "Added to your draft. Review it and press Send when ready."
          : "Could not access this conversation’s input. Use Copy or Edit instead.",
      );
    } catch {
      if (activeRow.current === rowKey)
        setNote("Could not check this suggestion. Please try again.");
    } finally {
      fillPending.current = false;
      setFilling(false);
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
              editable={state === "ready" && !filling}
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
            <Pressable
              accessibilityRole={canFill ? "button" : undefined}
              accessibilityLabel={canFill ? "Use question in composer" : undefined}
              disabled={!canFill || filling || state !== "ready"}
              onPress={() => {
                void fill();
              }}
            >
              <Text
                selectable={!canFill}
                style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 21 }}
              >
                {text}
              </Text>
            </Pressable>
          )}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {canFill
              ? action(
                  filling ? "Adding…" : "Use in composer",
                  () => {
                    void fill();
                  },
                  filling || state !== "ready" || !text.trim(),
                )
              : null}
            {!editing
              ? action("Edit", () => setEditing(true), filling)
              : action(
                  state === "sending" ? "Sending…" : "Send question",
                  () => {
                    void submit();
                  },
                  filling || state === "sending" || !text.trim(),
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
