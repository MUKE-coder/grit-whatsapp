import { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  tint: string;
}

const INTEGRATIONS: Integration[] = [
  { id: "stripe", name: "Stripe", description: "Payments and billing", icon: "card-outline", tint: "#6c5ce7" },
  { id: "resend", name: "Resend", description: "Transactional email", icon: "mail-outline", tint: "#00b894" },
  { id: "slack", name: "Slack", description: "Team notifications", icon: "chatbubbles-outline", tint: "#74b9ff" },
  { id: "github", name: "GitHub", description: "Sync issues and PRs", icon: "logo-github", tint: "#9090a8" },
  { id: "openai", name: "OpenAI", description: "AI features", icon: "sparkles-outline", tint: "#fdcb6e" },
];

export default function IntegrationsScreen() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Integrations" subtitle="Connected services" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        {INTEGRATIONS.map((it) => {
          const on = connected[it.id];
          return (
            <View
              key={it.id}
              className="flex-row items-center bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] rounded-2xl p-4 mb-3"
            >
              <View style={{ backgroundColor: it.tint + "20" }} className="w-11 h-11 rounded-xl items-center justify-center mr-4">
                <Ionicons name={it.icon as any} size={22} color={it.tint} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white">{it.name}</Text>
                <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] mt-0.5">{it.description}</Text>
              </View>
              <Pressable
                onPress={() => setConnected((c) => ({ ...c, [it.id]: !c[it.id] }))}
                className={on ? "px-4 py-2 rounded-full bg-[#6c5ce7]/12" : "px-4 py-2 rounded-full bg-[#6c5ce7]"}
              >
                <Text className={on ? "text-[13px] font-semibold text-[#6c5ce7]" : "text-[13px] font-semibold text-white"}>
                  {on ? "Connected" : "Connect"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
