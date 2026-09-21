import { useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { useBlogs, type Blog } from "@/hooks/use-blogs";

export default function BlogsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const query = useBlogs(search);
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  const renderItem = ({ item }: { item: Blog }) => (
    <View className="flex-row items-center bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-4 mb-3">
      {item.image ? (
        <Image source={{ uri: item.image }} style={{ width: 48, height: 48, borderRadius: 12, marginRight: 12 }} contentFit="cover" />
      ) : (
        <View className="w-12 h-12 rounded-xl bg-[#6c5ce7]/12 mr-3 items-center justify-center">
          <Ionicons name="newspaper-outline" size={20} color="#6c5ce7" />
        </View>
      )}
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white" numberOfLines={1}>{item.title}</Text>
        <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] mt-0.5" numberOfLines={1}>{item.excerpt}</Text>
      </View>
      <View style={{ backgroundColor: (item.published ? "#00b894" : "#9CA3AF") + "22" }} className="px-2.5 py-1 rounded-full">
        <Text style={{ color: item.published ? "#00b894" : "#9CA3AF" }} className="text-[11px] font-semibold">
          {item.published ? "Live" : "Draft"}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader
        title="Blogs"
        subtitle="Posts and articles"
        showBack
        right={
          <Pressable onPress={() => router.push("/blogs/new")} hitSlop={8}>
            <Ionicons name="add-circle" size={28} color="#6c5ce7" />
          </Pressable>
        }
      />
      <View className="px-6 pb-3">
        <View className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl flex-row items-center px-4" style={{ height: 48 }}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
            placeholder="Search posts..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>
      </View>
      <FlatList
        data={items}
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
              <Ionicons name="newspaper-outline" size={40} color="#9CA3AF" />
              <Text className="text-[#6B7280] dark:text-[#9090a8] mt-3">No posts yet — run grit seed</Text>
            </View>
          )
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color="#6c5ce7" style={{ marginVertical: 16 }} /> : null}
      />
    </View>
  );
}
