import { useState } from "react";
import { View, Text, TextInput, ScrollView, FlatList, Pressable, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { FormSheet } from "@/components/ui/form-sheet";
import { useTheme } from "@/lib/theme";
import { useMessages, useCreateMessage, type Message } from "@/hooks/use-messages";
import { MessageForm } from "@/components/resource-forms/messages-form";
import { exportResourceCsv } from "@/lib/export";
import { ImportSheet } from "@/components/ui/import-sheet";
import { Image } from "expo-image";
import { resolveImageUrl } from "@/lib/images";
import { useConversations } from "@/hooks/use-conversations";
import { useUsers } from "@/hooks/use-users";
const TABLE_WIDTH = 784;

export default function MessagesScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const create = useCreateMessage();
  const fConversationIDQuery = useConversations("", {}, "created_at", "desc", 500);
  const fConversationIDOpts = fConversationIDQuery.data?.pages.flatMap((p: any) => p.data) ?? [];
  const fSenderIDQuery = useUsers("", {}, "created_at", "desc", 500);
  const fSenderIDOpts = fSenderIDQuery.data?.pages.flatMap((p: any) => p.data) ?? [];
  const query = useMessages(search, filters, sortBy, sortOrder);
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  const onSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  const onExport = async () => {
    try {
      await exportResourceCsv("messages", search ? "search=" + encodeURIComponent(search) : "");
    } catch (e: any) {
      Alert.alert("Export failed", e.message || "Please try again");
    }
  };

  const renderItem = ({ item }: { item: Message }) => (
    <Pressable
      onPress={() => router.push("/messages/" + item.id)}
      className="flex-row items-center border-b border-[#E5E7EB] dark:border-[#1f1f2b] bg-white dark:bg-[#111118]"
      style={{ width: TABLE_WIDTH }}
    >
      <View style={{ width: 64 }} className="px-2 py-2 items-center justify-center">
        {item.attachment?.url ? (
          <Image source={{ uri: resolveImageUrl(item.attachment?.url) }} style={{ width: 44, height: 44, borderRadius: 10 }} contentFit="cover" />
        ) : (
          <View className="w-11 h-11 rounded-[10px] bg-[#6c5ce7]/12 items-center justify-center"><Ionicons name="image-outline" size={18} color="#6c5ce7" /></View>
        )}
      </View>
      <View style={{ width: 120 }} className="px-3 py-3">
        <Text numberOfLines={1} className="text-[14px] text-[#0F1018] dark:text-white">{String(item.id).slice(0, 8)}</Text>
      </View>
      <View style={{ width: 150 }} className="px-3 py-3">
        <Text numberOfLines={1} className="text-[14px] text-[#0F1018] dark:text-white">{(item.conversation && (item.conversation.name || item.conversation.title)) || item.conversation_id || ""}</Text>
      </View>
      <View style={{ width: 150 }} className="px-3 py-3">
        <Text numberOfLines={1} className="text-[14px] text-[#0F1018] dark:text-white">{(item.sender && (item.sender.name || item.sender.title)) || item.sender_id || ""}</Text>
      </View>
      <View style={{ width: 150 }} className="px-3 py-3">
        <Text numberOfLines={1} className="text-[14px] text-[#0F1018] dark:text-white">{String(item.body ?? "")}</Text>
      </View>
      <View style={{ width: 150 }} className="px-3 py-3">
        <Text numberOfLines={1} className="text-[14px] text-[#0F1018] dark:text-white">{String(item.kind ?? "")}</Text>
      </View>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader
        title="Messages"
        subtitle="Browse all messages"
        showBack
        right={
          <View className="flex-row items-center">
            <Pressable onPress={() => setFilterOpen(true)} hitSlop={8} className="mr-4">
              <View>
                <Ionicons name="funnel-outline" size={21} color="#6c5ce7" />
                {Object.keys(filters).length > 0 ? <View className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ff6b6b]" /> : null}
              </View>
            </Pressable>
            <Pressable onPress={onExport} hitSlop={8} className="mr-4">
              <Ionicons name="download-outline" size={23} color="#6c5ce7" />
            </Pressable>
            <Pressable onPress={() => setImportOpen(true)} hitSlop={8} className="mr-4">
              <Ionicons name="cloud-upload-outline" size={23} color="#6c5ce7" />
            </Pressable>
            <Pressable onPress={() => setSheetOpen(true)} hitSlop={8}>
              <Ionicons name="add-circle" size={28} color="#6c5ce7" />
            </Pressable>
          </View>
        }
      />
      <View className="px-6 pb-3">
        <View
          className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl flex-row items-center px-4"
          style={{ height: 48 }}
        >
          <Ionicons name="search-outline" size={18} color={palette.inputIcon} />
          <TextInput
            className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
            placeholder="Search messages..."
            placeholderTextColor={palette.placeholder}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ width: TABLE_WIDTH }}>
          <View className="flex-row border-b-2 border-[#E5E7EB] dark:border-[#2a2a3a]" style={{ width: TABLE_WIDTH }}>
            <View style={{ width: 64 }} className="px-3 py-3" />
            <View style={{ width: 120 }} className="px-3 py-3">
              <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8]" numberOfLines={1}>ID</Text>
            </View>
            <View style={{ width: 150 }} className="px-3 py-3">
              <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8]" numberOfLines={1}>Conversation</Text>
            </View>
            <View style={{ width: 150 }} className="px-3 py-3">
              <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8]" numberOfLines={1}>User</Text>
            </View>
            <View style={{ width: 150 }} className="px-3 py-3">
              <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8]" numberOfLines={1}>Body</Text>
            </View>
            <View style={{ width: 150 }} className="px-3 py-3">
              <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8]" numberOfLines={1}>Kind</Text>
            </View>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={{ flex: 1 }}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={palette.refresh} />
            }
            ListEmptyComponent={
              query.isLoading ? (
                <ActivityIndicator color={palette.refresh} style={{ marginTop: 40 }} />
              ) : (
                <Text className="text-[#6B7280] dark:text-[#9090a8] p-6">No messages yet</Text>
              )
            }
            ListFooterComponent={
              query.isFetchingNextPage ? (
                <ActivityIndicator color={palette.refresh} style={{ marginVertical: 16 }} />
              ) : null
            }
          />
        </View>
      </ScrollView>

      <FormSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="New Message">
        <MessageForm
          submitting={create.isPending}
          submitLabel="Create Message"
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            setSheetOpen(false);
          }}
        />
      </FormSheet>
      <FormSheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filters">
        <Text className="text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2">Conversation</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <Pressable onPress={() => setFilters((f) => { const n = { ...f }; delete n.conversation_id; return n; })} className={!filters.conversation_id ? "px-4 py-2 mr-2 rounded-full bg-[#6c5ce7]" : "px-4 py-2 mr-2 rounded-full bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a]"}>
            <Text className={!filters.conversation_id ? "text-white font-medium" : "text-[#0F1018] dark:text-white"}>All</Text>
          </Pressable>
          {fConversationIDOpts.map((opt: any) => (
            <Pressable key={opt.id} onPress={() => setFilters((f) => ({ ...f, conversation_id: opt.id }))} className={filters.conversation_id === opt.id ? "px-4 py-2 mr-2 rounded-full bg-[#6c5ce7]" : "px-4 py-2 mr-2 rounded-full bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a]"}>
              <Text className={filters.conversation_id === opt.id ? "text-white font-medium" : "text-[#0F1018] dark:text-white"}>{opt.name || opt.title || opt.id}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text className="text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2">User</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <Pressable onPress={() => setFilters((f) => { const n = { ...f }; delete n.sender_id; return n; })} className={!filters.sender_id ? "px-4 py-2 mr-2 rounded-full bg-[#6c5ce7]" : "px-4 py-2 mr-2 rounded-full bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a]"}>
            <Text className={!filters.sender_id ? "text-white font-medium" : "text-[#0F1018] dark:text-white"}>All</Text>
          </Pressable>
          {fSenderIDOpts.map((opt: any) => (
            <Pressable key={opt.id} onPress={() => setFilters((f) => ({ ...f, sender_id: opt.id }))} className={filters.sender_id === opt.id ? "px-4 py-2 mr-2 rounded-full bg-[#6c5ce7]" : "px-4 py-2 mr-2 rounded-full bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a]"}>
              <Text className={filters.sender_id === opt.id ? "text-white font-medium" : "text-[#0F1018] dark:text-white"}>{opt.name || opt.title || opt.id}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={() => setFilters({})} className="border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-full py-3 items-center mb-3">
          <Text className="text-[#6B7280] dark:text-[#9090a8] font-semibold">Clear all</Text>
        </Pressable>
        <Pressable onPress={() => setFilterOpen(false)} className="bg-[#6c5ce7] rounded-full py-4 items-center">
          <Text className="text-white font-semibold text-[15px]">Done</Text>
        </Pressable>
      </FormSheet>

      <ImportSheet plural="messages" visible={importOpen} onClose={() => setImportOpen(false)} onImported={() => query.refetch()} />
    </View>
  );
}
