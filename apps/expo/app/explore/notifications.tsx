import { View, Text, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { api } from "@/lib/api";

interface Notification {
  id: string;
  title?: string;
  message?: string;
  body?: string;
  read?: boolean;
  read_at?: string | null;
  created_at?: string;
}

export default function NotificationsScreen() {
  const query = useQuery({
    queryKey: ["explore-notifications"],
    queryFn: async () => api.get("/notifications"),
  });
  const items: Notification[] = (query.data as any)?.data ?? [];

  const renderItem = ({ item }: { item: Notification }) => {
    const unread = !item.read && !item.read_at;
    return (
      <View className="flex-row items-start bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-4 mb-3">
        <View className="w-10 h-10 rounded-full bg-[#6c5ce7]/12 items-center justify-center mr-3">
          <Ionicons name="notifications" size={18} color="#6c5ce7" />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-[#0F1018] dark:text-white">
            {item.title || "Notification"}
          </Text>
          <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] mt-0.5">
            {item.message || item.body || ""}
          </Text>
        </View>
        {unread ? <View className="w-2.5 h-2.5 rounded-full bg-[#6c5ce7] mt-1" /> : null}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Notifications" subtitle="Alerts and messages" showBack />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor="#6c5ce7" />}
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator color="#6c5ce7" style={{ marginTop: 40 }} />
          ) : (
            <View className="items-center mt-16">
              <Ionicons name="notifications-off-outline" size={40} color="#9CA3AF" />
              <Text className="text-[#6B7280] dark:text-[#9090a8] mt-3">You're all caught up</Text>
            </View>
          )
        }
      />
    </View>
  );
}
