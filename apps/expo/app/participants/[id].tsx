import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { useTheme } from "@/lib/theme";
import { useParticipant, useDeleteParticipant } from "@/hooks/use-participants";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View className="flex-row items-start justify-between px-5 py-4 border-b border-[#E5E7EB] dark:border-[#2a2a3a]">
      <Text className="text-[14px] text-[#6B7280] dark:text-[#9090a8]">{label}</Text>
      <Text
        className="text-[14px] text-[#0F1018] dark:text-white font-medium flex-1 text-right ml-4"
        numberOfLines={4}
      >
        {value === null || value === undefined || value === "" ? "—" : String(value)}
      </Text>
    </View>
  );
}

export default function ParticipantDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const { data: item, isLoading } = useParticipant(id);
  const del = useDeleteParticipant();

  const onDelete = () => {
    Alert.alert("Delete participant", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await del.mutateAsync(id);
            router.back();
          } catch (e: any) {
            Alert.alert("Delete failed", e.message || "Please try again");
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Participant" showBack />
      {isLoading || !item ? (
        <ActivityIndicator color={palette.refresh} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          
          <Text className="text-[22px] font-bold text-[#0F1018] dark:text-white mb-4">
            {item.id ? String(item.id) : "Untitled"}
          </Text>
          <View className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl overflow-hidden">
            <Row label="Conversation" value={(item.conversation && (item.conversation.name || item.conversation.title)) || item.conversation_id} />
            <Row label="User" value={(item.user && (item.user.name || item.user.title)) || item.user_id} />
            <Row label="Role" value={item.role} />
            <Row label="Last Read At" value={item.last_read_at ? new Date(item.last_read_at).toLocaleString() : "—"} />
            <Row label="Last Delivered At" value={item.last_delivered_at ? new Date(item.last_delivered_at).toLocaleString() : "—"} />
            <Row label="Muted" value={item.muted ? "Yes" : "No"} />
          </View>

          <Pressable
            onPress={() => router.push({ pathname: "/participants/edit/[id]", params: { id } })}
            className="bg-[#6c5ce7] rounded-full py-4 items-center mt-6 flex-row justify-center"
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text className="text-white font-semibold text-[15px] ml-2">Edit</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 rounded-full py-4 items-center mt-3 flex-row justify-center"
          >
            <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
            <Text className="text-[#ff6b6b] font-semibold text-[15px] ml-2">Delete</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
