import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { api } from "@/lib/api";

function Metric({ icon, label, value, tint }: { icon: string; label: string; value: string; tint: string }) {
  return (
    <View className="flex-1 bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-4 m-1.5">
      <View style={{ backgroundColor: tint + "20" }} className="w-9 h-9 rounded-xl items-center justify-center mb-3">
        <Ionicons name={icon as any} size={18} color={tint} />
      </View>
      <Text className="text-[24px] font-bold text-[#0F1018] dark:text-white">{value}</Text>
      <Text className="text-[12px] text-[#6B7280] dark:text-[#9090a8] mt-0.5">{label}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const usersQ = useQuery({ queryKey: ["an-users"], queryFn: async () => api.get("/users?page=1&page_size=1") });
  const filesQ = useQuery({ queryKey: ["an-uploads"], queryFn: async () => api.get("/uploads?page=1&page_size=1") });

  const userCount = (usersQ.data as any)?.meta?.total ?? 0;
  const fileCount = (filesQ.data as any)?.meta?.total ?? 0;
  const refreshing = usersQ.isRefetching || filesQ.isRefetching;
  const onRefresh = () => { usersQ.refetch(); filesQ.refetch(); };

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Analytics" subtitle="Usage at a glance" showBack />
      <ScrollView
        contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c5ce7" />}
      >
        <View className="flex-row">
          <Metric icon="people-outline" label="Total users" value={String(userCount)} tint="#6c5ce7" />
          <Metric icon="cloud-outline" label="Files stored" value={String(fileCount)} tint="#00b894" />
        </View>
        <View className="flex-row">
          <Metric icon="pulse-outline" label="Active today" value={String(userCount)} tint="#74b9ff" />
          <Metric icon="trending-up-outline" label="Growth" value="+0%" tint="#fdcb6e" />
        </View>

        <View className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-5 mt-3">
          <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white mb-1">Wire up your metrics</Text>
          <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] leading-5">
            These cards read live counts from your API. Add resource-specific endpoints
            and drop more Metric cards here as your product grows.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
