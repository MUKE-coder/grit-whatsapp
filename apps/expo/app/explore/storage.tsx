import { View, Text, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { api } from "@/lib/api";

interface Upload {
  id: string;
  original_name: string;
  mime_type: string;
  size: number;
  url: string;
  thumbnail_url?: string;
}

function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
}

export default function StorageScreen() {
  const query = useInfiniteQuery({
    queryKey: ["explore-uploads"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get("/uploads?page=" + pageParam + "&page_size=20"),
    getNextPageParam: (last: any) =>
      last?.meta && last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined,
  });
  const files: Upload[] = query.data?.pages.flatMap((p: any) => p.data) ?? [];
  const total = (query.data?.pages[0] as any)?.meta?.total ?? files.length;

  const renderItem = ({ item }: { item: Upload }) => {
    const isImage = item.mime_type?.startsWith("image/");
    const thumb = item.thumbnail_url || item.url;
    return (
      <View className="flex-row items-center bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-3 mb-3">
        {isImage && thumb ? (
          <Image source={{ uri: thumb }} style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }} contentFit="cover" />
        ) : (
          <View className="w-11 h-11 rounded-[10px] bg-[#6c5ce7]/12 items-center justify-center mr-3">
            <Ionicons name="document-outline" size={20} color="#6c5ce7" />
          </View>
        )}
        <View className="flex-1">
          <Text className="text-[14px] font-medium text-[#0F1018] dark:text-white" numberOfLines={1}>
            {item.original_name}
          </Text>
          <Text className="text-[12px] text-[#6B7280] dark:text-[#9090a8]">{humanSize(item.size)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Storage" subtitle={total + " file" + (total === 1 ? "" : "s")} showBack />
      <FlatList
        data={files}
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
            <View className="items-center mt-16">
              <Ionicons name="cloud-outline" size={40} color="#9CA3AF" />
              <Text className="text-[#6B7280] dark:text-[#9090a8] mt-3">No files uploaded yet</Text>
            </View>
          )
        }
      />
    </View>
  );
}
