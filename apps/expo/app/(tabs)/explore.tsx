import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";

interface LinkItem {
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
}

// Generated resources. `grit generate resource` injects an entry below the
// marker for every resource, so each one's list screen is reachable here.
const resources: LinkItem[] = [
  { title: "Users", description: "Manage user accounts", icon: "people-outline", color: "#6c5ce7", route: "/explore/users" },
  { title: "Blogs", description: "Posts and articles", icon: "newspaper-outline", color: "#00b894", route: "/blogs" },
  // grit:mobile-resources
  { title: "Messages", description: "Browse and manage messages", icon: "cube-outline", color: "#6c5ce7", route: "/messages" },
  { title: "Participants", description: "Browse and manage participants", icon: "cube-outline", color: "#6c5ce7", route: "/participants" },
  { title: "Conversations", description: "Browse and manage conversations", icon: "cube-outline", color: "#6c5ce7", route: "/conversations" },
];

const tools: LinkItem[] = [
  { title: "Content", description: "Posts, pages, and media", icon: "document-text-outline", color: "#00b894", route: "/explore/content" },
  { title: "Analytics", description: "Usage and performance", icon: "bar-chart-outline", color: "#74b9ff", route: "/explore/analytics" },
  { title: "Notifications", description: "Alerts and messages", icon: "notifications-outline", color: "#fdcb6e", route: "/explore/notifications" },
  { title: "Storage", description: "Files and uploads", icon: "cloud-outline", color: "#ff6b6b", route: "/explore/storage" },
  { title: "Backups", description: "Weekly database backups", icon: "server-outline", color: "#0984e3", route: "/backups" },
  { title: "Integrations", description: "Connected services", icon: "extension-puzzle-outline", color: "#a29bfe", route: "/explore/integrations" },
];

function LinkCard({ item }: { item: LinkItem }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-5 mb-3"
      activeOpacity={0.7}
      onPress={() => router.push(item.route as any)}
    >
      <View className="flex-row items-center">
        <View
          className="w-11 h-11 rounded-xl items-center justify-center mr-4"
          style={{ backgroundColor: item.color + "20" }}
        >
          <Ionicons name={item.icon as any} size={22} color={item.color} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-[#0F1018] dark:text-white">{item.title}</Text>
          <Text className="text-xs text-[#6B7280] dark:text-[#9090a8] mt-0.5">{item.description}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-[13px] font-semibold uppercase tracking-wider text-[#9CA3AF] dark:text-[#606078] mb-3 mt-2">
      {children}
    </Text>
  );
}

export default function MoreScreen() {
  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="More" subtitle="Resources & tools" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}>
        <SectionTitle>Resources</SectionTitle>
        {resources.length > 0 ? (
          resources.map((item) => <LinkCard key={item.route} item={item} />)
        ) : (
          <View className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-5 mb-3">
            <Text className="text-[14px] text-[#6B7280] dark:text-[#9090a8] leading-5">
              Generate a resource and it shows up here:{"\n"}
              <Text className="font-semibold text-[#6c5ce7]">grit generate resource Product</Text>
            </Text>
          </View>
        )}

        <SectionTitle>Tools</SectionTitle>
        {tools.map((item) => (
          <LinkCard key={item.route} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}
