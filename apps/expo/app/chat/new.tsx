import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/chat/bits";
import { useStartDirect, useUserSearch } from "@/hooks/use-chat";
import { displayName } from "@/lib/chat";
import { useTheme } from "@/lib/theme";

/** Pick someone to message: finds or starts the one direct chat with them. */
export default function NewChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const [search, setSearch] = useState("");
  const users = useUserSearch(search.trim());
  const start = useStartDirect();

  return (
    <View className="flex-1 bg-white dark:bg-[#0a0a0f]" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-2 pt-2 pb-3">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="p-2"
        >
          <Ionicons name="chevron-back" size={26} color="#7c6cf7" />
        </Pressable>
        <Text className="text-xl font-bold text-[#0f172a] dark:text-[#e8e8f0]">New chat</Text>
      </View>
      <View className="mx-4 mb-2 flex-row items-center rounded-xl bg-[#f1f5f9] px-3 dark:bg-[#1a1a24]">
        <Ionicons name="search" size={16} color={palette.placeholder} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search people"
          placeholderTextColor={palette.placeholder}
          accessibilityLabel="Search people"
          autoFocus
          className="flex-1 px-2 py-2.5 text-[15px] text-[#0f172a] dark:text-[#e8e8f0]"
        />
      </View>
      {users.isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <FlatList
          data={users.data ?? []}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              disabled={start.isPending}
              onPress={() =>
                start.mutate(item.id, {
                  onSuccess: (conv) => router.replace(`/chat/${conv.id}`),
                  onError: (e) => Alert.alert("Could not start the chat", e.message),
                })
              }
              accessibilityRole="button"
              className="flex-row items-center px-4 py-3 active:bg-[#f1f5f9] dark:active:bg-[#1a1a24]"
            >
              <Avatar id={item.id} name={displayName(item)} src={item.avatar} size={44} />
              <Text className="ml-3 text-[16px] font-medium text-[#0f172a] dark:text-[#e8e8f0]">
                {displayName(item)}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text className="mt-10 text-center text-[#606078]">Nobody found.</Text>}
        />
      )}
    </View>
  );
}
