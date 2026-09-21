import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { api } from "@/lib/api";

interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  avatar?: string;
}

const ROLE_TINT: Record<string, string> = {
  ADMIN: "#6c5ce7",
  EDITOR: "#00b894",
  USER: "#74b9ff",
};

export default function UsersScreen() {
  const router = useRouter();
  // GET /users is an admin route — the seeded admin account can browse it.
  const query = useInfiniteQuery({
    queryKey: ["explore-users"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get("/users?page=" + pageParam + "&page_size=20"),
    getNextPageParam: (last: any) =>
      last?.meta && last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined,
  });
  const users: UserRow[] = query.data?.pages.flatMap((p: any) => p.data) ?? [];

  const renderItem = ({ item }: { item: UserRow }) => {
    const initials = ((item.first_name?.[0] || "") + (item.last_name?.[0] || "")).toUpperCase() || "?";
    const tint = ROLE_TINT[item.role] || "#6c5ce7";
    return (
      <View className="flex-row items-center bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-4 mb-3">
        <View className="w-11 h-11 rounded-full bg-[#6c5ce7]/12 items-center justify-center mr-3">
          <Text className="text-[#6c5ce7] font-bold">{initials}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white" numberOfLines={1}>
            {item.first_name} {item.last_name}
          </Text>
          <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8]" numberOfLines={1}>{item.email}</Text>
        </View>
        <View style={{ backgroundColor: tint + "22" }} className="px-2.5 py-1 rounded-full">
          <Text style={{ color: tint }} className="text-[11px] font-semibold capitalize">
            {(item.role || "user").toLowerCase()}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader
        title="Users"
        subtitle="All user accounts"
        showBack
        right={
          <Pressable onPress={() => router.push("/users/new")} hitSlop={8}>
            <Ionicons name="add-circle" size={28} color="#6c5ce7" />
          </Pressable>
        }
      />
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor="#6c5ce7" />}
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator color="#6c5ce7" style={{ marginTop: 40 }} />
          ) : (
            <Text className="text-center text-[#6B7280] dark:text-[#9090a8] mt-16">No users found</Text>
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? <ActivityIndicator color="#6c5ce7" style={{ marginVertical: 16 }} /> : null
        }
      />
    </View>
  );
}
