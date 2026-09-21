import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";

interface Role {
  id: string;
  name: string;
  description: string;
  grants: string[];
  expanded: string[];
  is_system: boolean;
  user_count: number;
}

export default function RolesScreen() {
  const router = useRouter();
  const { can, isLoading: permsLoading } = usePermissions();

  const { data: roles, isLoading, refetch, isRefetching } = useQuery<Role[]>({
    queryKey: ["roles"],
    enabled: can("roles.view"),
    queryFn: async () => {
      const res = await api.get("/roles");
      return (res.data ?? []) as Role[];
    },
  });

  if (permsLoading || isLoading) {
    return (
      <View className="flex-1 bg-[#F7F7F9] dark:bg-[#0a0a0f]">
        <ScreenHeader title="Roles & permissions" showBack />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6c5ce7" />
        </View>
      </View>
    );
  }

  // Hidden rather than empty: a user without roles.view has no business
  // seeing the shape of the permission system.
  if (!can("roles.view")) {
    return (
      <View className="flex-1 bg-[#F7F7F9] dark:bg-[#0a0a0f]">
        <ScreenHeader title="Roles & permissions" showBack />
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="lock-closed-outline" size={40} color="#9090a8" />
          <Text className="text-[#6B7280] dark:text-[#9090a8] text-[15px] text-center mt-4">
            You do not have permission to view roles.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F7F7F9] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Roles & permissions" showBack />
      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#6c5ce7" />}
      >
        <Text className="text-[13.5px] text-[#6B7280] dark:text-[#9090a8] mb-4">
          Define what each role can do. A role granted a whole resource keeps any actions added to it later.
        </Text>

        {can("roles.create") && (
          <Pressable
            onPress={() => router.push("/roles/new")}
            className="flex-row items-center justify-center rounded-2xl bg-[#6c5ce7] py-3.5 mb-5"
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text className="text-white font-semibold text-[15px] ml-2">New role</Text>
          </Pressable>
        )}

        {roles?.map((role) => (
          <Pressable
            key={role.id}
            onPress={() => router.push(`/roles/${role.id}`)}
            className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl p-4 mb-3"
          >
            <View className="flex-row items-center mb-1">
              <Text className="text-[16px] font-semibold text-[#0F1018] dark:text-white">{role.name}</Text>
              {role.is_system && (
                <View className="ml-2 px-2 py-0.5 rounded-full bg-[#F4F4F6] dark:bg-[#1a1a24]">
                  <Text className="text-[11px] text-[#6B7280] dark:text-[#9090a8]">Built-in</Text>
                </View>
              )}
            </View>
            <Text className="text-[13.5px] text-[#6B7280] dark:text-[#9090a8] mb-3">{role.description}</Text>
            <View className="flex-row items-center">
              <Text className="text-[12.5px] text-[#6B7280] dark:text-[#9090a8]">
                {role.user_count} {role.user_count === 1 ? "user" : "users"}
              </Text>
              <Text className="text-[12.5px] text-[#6c5ce7] ml-3 font-medium">
                {role.grants?.includes("*") ? "all permissions" : (role.expanded?.length ?? 0) + " granted"}
              </Text>
            </View>
          </Pressable>
        ))}

        <View className="h-10" />
      </ScrollView>
    </View>
  );
}
