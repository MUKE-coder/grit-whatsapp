import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/chat/bits";
import { useConversations, useOnline } from "@/hooks/use-chat";
import { useAuth } from "@/lib/auth";
import { type Conversation, conversationTitle, otherMember, shortTime } from "@/lib/chat";
import { useTheme } from "@/lib/theme";

/** The inbox: every chat, newest activity first, with unread counts. */
export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useConversations();
  const [filter, setFilter] = useState("");
  const term = filter.trim().toLowerCase();
  const rows = (data ?? []).filter((c) => !term || conversationTitle(c, user?.id).toLowerCase().includes(term));

  return (
    <View className="flex-1 bg-white dark:bg-[#0a0a0f]" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Text className="flex-1 text-2xl font-bold text-[#0f172a] dark:text-[#e8e8f0]">Chats</Text>
        <Pressable
          onPress={() => router.push("/chat/new")}
          accessibilityRole="button"
          accessibilityLabel="New chat"
          className="rounded-full p-2 active:opacity-60"
        >
          <Ionicons name="create-outline" size={24} color="#7c6cf7" />
        </Pressable>
      </View>
      <View className="mx-4 mb-2 flex-row items-center rounded-xl bg-[#f1f5f9] px-3 dark:bg-[#1a1a24]">
        <Ionicons name="search" size={16} color={palette.placeholder} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Search chats"
          placeholderTextColor={palette.placeholder}
          accessibilityLabel="Search chats"
          className="flex-1 px-2 py-2.5 text-[15px] text-[#0f172a] dark:text-[#e8e8f0]"
        />
      </View>
      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : isError ? (
        <Text className="mt-10 text-center text-[#ef4444]">Could not load your chats.</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <InboxRow conv={item} meId={user?.id} onPress={() => router.push(`/chat/${item.id}`)} />
          )}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.refresh} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={
            <Text className="mt-16 px-8 text-center text-[#606078]">
              {term ? "No chats match." : "No chats yet. Tap the pencil to start one."}
            </Text>
          }
        />
      )}
    </View>
  );
}

function InboxRow({ conv, meId, onPress }: { conv: Conversation; meId?: string; onPress: () => void }) {
  const other = otherMember(conv, meId);
  const online = useOnline(other?.id);
  const title = conversationTitle(conv, meId);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${conv.unread ? `, ${conv.unread} unread` : ""}`}
      className="flex-row items-center px-4 py-2.5 active:bg-[#f1f5f9] dark:active:bg-[#1a1a24]"
    >
      <Avatar id={other?.id ?? conv.id} name={title} src={other?.avatar} online={online} />
      <View className="ml-3 flex-1 border-b border-[#e2e8f0] pb-2.5 dark:border-[#2a2a3a]">
        <View className="flex-row items-baseline">
          <Text numberOfLines={1} className="flex-1 text-[16px] font-semibold text-[#0f172a] dark:text-[#e8e8f0]">
            {title}
          </Text>
          <Text className={conv.unread > 0 ? "text-xs text-[#10b981]" : "text-xs text-[#606078]"}>
            {shortTime(conv.last_message_at)}
          </Text>
        </View>
        <View className="mt-0.5 flex-row items-center">
          <Text numberOfLines={1} className="flex-1 text-[14px] text-[#475569] dark:text-[#9090a8]">
            {conv.last_message_preview || (conv.is_group ? "Group created" : "Say hello")}
          </Text>
          {conv.muted && <Ionicons name="notifications-off" size={14} color="#606078" />}
          {conv.unread > 0 && (
            <View className="ml-2 min-w-5 items-center rounded-full bg-[#10b981] px-1.5">
              <Text className="text-xs font-bold leading-5 text-white">{conv.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
