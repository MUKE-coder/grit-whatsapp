import { View, Text, ScrollView, RefreshControl, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";

interface Stats {
  total_users: number;
}

interface RecentItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  time: string;
}

function StatCard({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: number;
  color: string;
  icon: string;
}) {
  return (
    <View className="bg-white dark:bg-[#22222e] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl p-4 flex-1 min-w-[140px]">
      <View className="flex-row items-center justify-between mb-2">
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text className="text-2xl font-bold text-[#0F1018] dark:text-white">{value}</Text>
      <Text className="text-xs text-[#6B7280] dark:text-[#9090a8] mt-1">{title}</Text>
    </View>
  );
}

function RecentItemRow({ item }: { item: RecentItem }) {
  return (
    <View className="flex-row items-center bg-white dark:bg-[#22222e] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-xl px-4 py-3 mb-2">
      <View className="w-10 h-10 rounded-full bg-[#6c5ce7]/20 items-center justify-center mr-3">
        <Ionicons name={item.icon as any} size={18} color="#6c5ce7" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-[#0F1018] dark:text-white">{item.title}</Text>
        <Text className="text-xs text-[#6B7280] dark:text-[#9090a8] mt-0.5">{item.subtitle}</Text>
      </View>
      <Text className="text-xs text-[#9CA3AF] dark:text-[#606078]">{item.time}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // /users is ADMIN-only. Fetching it for everyone meant a regular user got a
  // 403 and the screen rendered 0 as if that were the real count. Ask only
  // when the user actually holds the permission.
  const { can, isLoading: permsLoading } = usePermissions();
  const canViewUsers = can("users.view");

  const { data: stats, refetch } = useQuery<Stats>({
    queryKey: ["home-stats"],
    enabled: canViewUsers,
    queryFn: async () => {
      const res = await api.get("/users?page=1&page_size=1");
      return { total_users: res.meta?.total ?? 0 };
    },
  });

  const { data: recentItems } = useQuery<RecentItem[]>({
    queryKey: ["recent-items"],
    queryFn: async () => {
      // Default placeholder items until the API provides recent activity
      return [
        { id: "1", title: "App launched", subtitle: "Your project is running", icon: "rocket-outline", time: "Now" },
        { id: "2", title: "API connected", subtitle: "Backend is reachable", icon: "cloud-done-outline", time: "Now" },
        { id: "3", title: "Auth ready", subtitle: "Login and register work", icon: "shield-checkmark-outline", time: "Now" },
      ];
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const firstName = user?.first_name || user?.name?.split(" ")[0] || "User";

  return (
    <ScrollView
      className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]"
      contentContainerClassName="px-6 pt-16 pb-28"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c5ce7" />
      }
    >
      <Text className="text-2xl font-bold text-[#0F1018] dark:text-white mb-1">
        Welcome back, {firstName}
      </Text>
      <Text className="text-base text-[#6B7280] dark:text-[#9090a8] mb-6">
        Here's what's happening today.
      </Text>

      {/* Only the counts the API actually reports, and only for users allowed
          to see them. The three sibling cards here used to be a copy of this
          number plus two hardcoded zeros — invented data on every install. */}
      {!permsLoading && canViewUsers && (
        <View className="flex-row gap-3 mb-8">
          <StatCard title="Total Users" value={stats?.total_users ?? 0} color="#6c5ce7" icon="people-outline" />
        </View>
      )}

      <Text className="text-lg font-semibold text-[#0F1018] dark:text-white mb-3">Recent Activity</Text>

      {recentItems?.map((item) => (
        <RecentItemRow key={item.id} item={item} />
      ))}

      <View className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl p-6 mt-4">
        <Text className="text-lg font-semibold text-[#0F1018] dark:text-white mb-3">Quick Start</Text>
        <Text className="text-sm text-[#6B7280] dark:text-[#9090a8] leading-6">
          Your Grit mobile app is connected to the API. Edit this screen in{"\n"}
          apps/expo/app/(tabs)/index.tsx
        </Text>
      </View>
    </ScrollView>
  );
}
