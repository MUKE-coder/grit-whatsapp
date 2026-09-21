import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";

const SECTIONS = [
  { icon: "document-text-outline", title: "Pages", description: "Static marketing and info pages", tint: "#6c5ce7" },
  { icon: "newspaper-outline", title: "Posts", description: "Blog posts and announcements", tint: "#00b894" },
  { icon: "images-outline", title: "Media", description: "Images, video and documents", tint: "#74b9ff" },
];

export default function ContentScreen() {
  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Content" subtitle="Posts, pages and media" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        {SECTIONS.map((s) => (
          <View
            key={s.title}
            className="flex-row items-center bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-5 mb-3"
          >
            <View style={{ backgroundColor: s.tint + "20" }} className="w-11 h-11 rounded-xl items-center justify-center mr-4">
              <Ionicons name={s.icon as any} size={22} color={s.tint} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white">{s.title}</Text>
              <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] mt-0.5">{s.description}</Text>
            </View>
          </View>
        ))}
        <View className="items-center mt-8">
          <Text className="text-[13px] text-[#9CA3AF] dark:text-[#606078] text-center px-6">
            Generate a content resource with{"\n"}
            <Text className="font-semibold text-[#6c5ce7]">grit generate resource Post</Text>
            {"\n"}to power this screen with real data.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
