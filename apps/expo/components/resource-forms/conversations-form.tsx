import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Switch, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface ConversationFormProps {
  initial?: Record<string, any>;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
}

// Shared create/edit form. Renders inside a page or a bottom sheet; the parent
// owns the mutation and navigation via onSubmit.
export function ConversationForm({ initial, onSubmit, submitting, submitLabel }: ConversationFormProps) {
  const i: any = initial || {};
  const [error, setError] = useState("");
  const [title, setTitle] = useState(i.title ?? "");
  const [isGroup, setIsGroup] = useState(i.is_group ?? false);
  const [lastMessageAt, setLastMessageAt] = useState(i.last_message_at ?? "");
  const [lastMessagePreview, setLastMessagePreview] = useState(i.last_message_preview ?? "");

  const inputClass =
    "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-3.5 text-[#0F1018] dark:text-white text-[15px] mb-4";
  const labelClass = "text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2";

  const submit = async () => {
    setError("");

    try {
      await onSubmit({
        title: title,
        is_group: isGroup,
        last_message_at: lastMessageAt || undefined,
        last_message_preview: lastMessagePreview,
      });
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    }
  };

  return (
    <View>
      {error ? (
        <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
          <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
          <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{error}</Text>
        </View>
      ) : null}

        <Text className={labelClass}>Title</Text>
        <TextInput className={inputClass} placeholder="Title" placeholderTextColor="#9CA3AF" value={title} onChangeText={setTitle} />
      <View className="flex-row items-center justify-between mb-4">
        <Text className={labelClass} style={{ marginBottom: 0 }}>Is Group</Text>
        <Switch value={isGroup} onValueChange={setIsGroup} trackColor={{ false: "#D1D5DB", true: "#6c5ce7" }} thumbColor="#ffffff" />
      </View>
        <Text className={labelClass}>Last Message At</Text>
        <TextInput className={inputClass} placeholder="Last Message At" placeholderTextColor="#9CA3AF" value={lastMessageAt} onChangeText={setLastMessageAt} />
        <Text className={labelClass}>Last Message Preview</Text>
        <TextInput className={inputClass} placeholder="Last Message Preview" placeholderTextColor="#9CA3AF" value={lastMessagePreview} onChangeText={setLastMessagePreview} />
      <Pressable
        onPress={submit}
        disabled={submitting}
        className="bg-[#6c5ce7] rounded-full py-4 items-center mt-2"
        style={{ opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold text-[15px]">{submitLabel || "Save"}</Text>
        )}
      </Pressable>
    </View>
  );
}
