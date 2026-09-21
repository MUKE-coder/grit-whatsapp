import { View, Text, Pressable } from "react-native";
import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
}

// Safe-area-aware page header. Non-tab screens pass showBack to get a back
// button; tab screens can use it without one for a consistent large title.
export function ScreenHeader({ title, subtitle, showBack = false, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <View style={{ paddingTop: insets.top + 8 }} className="px-6 pb-3 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <View className="flex-row items-center">
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            className="mr-3 w-9 h-9 rounded-full items-center justify-center bg-white dark:bg-[#1a1a24] border border-[#E5E7EB] dark:border-[#2a2a3a]"
          >
            <Ionicons name="chevron-back" size={20} color={palette.inputIcon} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-[26px] font-bold text-[#0F1018] dark:text-white tracking-tight">{title}</Text>
          {subtitle ? (
            <Text className="text-[14px] text-[#6B7280] dark:text-[#9090a8] mt-0.5">{subtitle}</Text>
          ) : null}
        </View>
        {right ? <View className="ml-3">{right}</View> : null}
      </View>
    </View>
  );
}
