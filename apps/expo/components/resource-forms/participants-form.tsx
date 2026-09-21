import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Switch, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useConversations } from "@/hooks/use-conversations";
import { RelationSelect } from "@/components/ui/relation-select";
import { useUsers } from "@/hooks/use-users";

export interface ParticipantFormProps {
  initial?: Record<string, any>;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
}

// Shared create/edit form. Renders inside a page or a bottom sheet; the parent
// owns the mutation and navigation via onSubmit.
export function ParticipantForm({ initial, onSubmit, submitting, submitLabel }: ParticipantFormProps) {
  const i: any = initial || {};
  const [error, setError] = useState("");
  const [conversationID, setConversationID] = useState(i.conversation_id ?? "");
  const [userID, setUserID] = useState(i.user_id ?? "");
  const [role, setRole] = useState(i.role ?? "");
  const [lastReadAt, setLastReadAt] = useState(i.last_read_at ?? "");
  const [lastDeliveredAt, setLastDeliveredAt] = useState(i.last_delivered_at ?? "");
  const [muted, setMuted] = useState(i.muted ?? false);
  const conversationsQuery = useConversations("", {}, "created_at", "desc", 500);
  const conversationsOpts = conversationsQuery.data?.pages.flatMap((p: any) => p.data) ?? [];
  const usersQuery = useUsers("", {}, "created_at", "desc", 500);
  const usersOpts = usersQuery.data?.pages.flatMap((p: any) => p.data) ?? [];
  const inputClass =
    "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-3.5 text-[#0F1018] dark:text-white text-[15px] mb-4";
  const labelClass = "text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2";

  const submit = async () => {
    setError("");
    if (!conversationID) return setError("Conversation is required");
    if (!userID) return setError("User is required");
    try {
      await onSubmit({
        conversation_id: conversationID,
        user_id: userID,
        role: role,
        last_read_at: lastReadAt || undefined,
        last_delivered_at: lastDeliveredAt || undefined,
        muted: muted,
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

      <RelationSelect label="Conversation" value={conversationID} onChange={setConversationID} options={conversationsOpts} />
      <RelationSelect label="User" value={userID} onChange={setUserID} options={usersOpts} />
        <Text className={labelClass}>Role</Text>
        <TextInput className={inputClass} placeholder="Role" placeholderTextColor="#9CA3AF" value={role} onChangeText={setRole} />
        <Text className={labelClass}>Last Read At</Text>
        <TextInput className={inputClass} placeholder="Last Read At" placeholderTextColor="#9CA3AF" value={lastReadAt} onChangeText={setLastReadAt} />
        <Text className={labelClass}>Last Delivered At</Text>
        <TextInput className={inputClass} placeholder="Last Delivered At" placeholderTextColor="#9CA3AF" value={lastDeliveredAt} onChangeText={setLastDeliveredAt} />
      <View className="flex-row items-center justify-between mb-4">
        <Text className={labelClass} style={{ marginBottom: 0 }}>Muted</Text>
        <Switch value={muted} onValueChange={setMuted} trackColor={{ false: "#D1D5DB", true: "#6c5ce7" }} thumbColor="#ffffff" />
      </View>
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
