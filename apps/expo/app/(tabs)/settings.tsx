import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  Switch,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

interface SettingItem {
  id: string;
  title: string;
  icon: string;
  type: "toggle" | "select" | "action" | "info";
  value?: string;
  danger?: boolean;
}

interface SettingSection {
  title: string;
  data: SettingItem[];
}

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { scheme, setMode } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState("English");

  const handleToggle = (id: string, value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Persisted theme switch — flips the whole app between light and dark.
    if (id === "dark_mode") setMode(value ? "dark" : "light");
    if (id === "notifications") setNotifications(value);
  };

  const handleLanguage = () => {
    Alert.alert("Language", "Select your preferred language", [
      { text: "English", onPress: () => setLanguage("English") },
      { text: "Spanish", onPress: () => setLanguage("Spanish") },
      { text: "French", onPress: () => setLanguage("French") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleClearCache = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Clear Cache",
      "This will clear all cached data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  };

  const sections: SettingSection[] = [
    {
      title: "Preferences",
      data: [
        { id: "dark_mode", title: "Dark Mode", icon: "moon-outline", type: "toggle" },
        { id: "notifications", title: "Notifications", icon: "notifications-outline", type: "toggle" },
        { id: "language", title: "Language", icon: "language-outline", type: "select", value: language },
      ],
    },
    {
      title: "Security",
      data: [
        { id: "two_factor", title: "Two-Factor Authentication", icon: "shield-checkmark-outline", type: "action" },
      ],
    },
    {
      title: "Data",
      data: [
        { id: "clear_cache", title: "Clear Cache", icon: "trash-outline", type: "action" },
      ],
    },
    {
      title: "About",
      data: [
        { id: "version", title: "App Version", icon: "information-circle-outline", type: "info", value: "1.0.0" },
        { id: "build", title: "Build", icon: "code-outline", type: "info", value: "1" },
      ],
    },
    {
      title: "",
      data: [
        { id: "logout", title: "Sign Out", icon: "log-out-outline", type: "action", danger: true },
      ],
    },
  ];

  const renderItem = ({ item }: { item: SettingItem }) => {
    const onPress = () => {
      if (item.id === "language") handleLanguage();
      if (item.id === "clear_cache") handleClearCache();
      if (item.id === "two_factor") router.push("/two-factor");
      if (item.id === "logout") handleLogout();
    };

    return (
      <TouchableOpacity
        className="flex-row items-center bg-white dark:bg-[#111118] px-5 py-4"
        activeOpacity={item.type === "info" ? 1 : 0.7}
        onPress={item.type !== "info" && item.type !== "toggle" ? onPress : undefined}
        disabled={item.type === "info" || item.type === "toggle"}
      >
        <Ionicons
          name={item.icon as any}
          size={20}
          color={item.danger ? "#ff6b6b" : "#9090a8"}
        />
        <Text
          className={`text-sm ml-3 flex-1 ${item.danger ? "text-[#ff6b6b] font-semibold" : "text-[#0F1018] dark:text-white"}`}
        >
          {item.title}
        </Text>

        {item.type === "toggle" ? (
          <Switch
            value={item.id === "dark_mode" ? scheme === "dark" : notifications}
            onValueChange={(val) => handleToggle(item.id, val)}
            trackColor={{ false: scheme === "dark" ? "#2a2a3a" : "#D1D5DB", true: "#6c5ce7" }}
            thumbColor="#ffffff"
          />
        ) : null}

        {item.type === "select" ? (
          <View className="flex-row items-center">
            <Text className="text-sm text-[#6B7280] dark:text-[#9090a8] mr-2">{item.value}</Text>
            <Ionicons name="chevron-forward" size={16} color="#606078" />
          </View>
        ) : null}

        {item.type === "info" ? (
          <Text className="text-sm text-[#9CA3AF] dark:text-[#606078]">{item.value}</Text>
        ) : null}

        {item.type === "action" && !item.danger ? (
          <Ionicons name="chevron-forward" size={16} color="#606078" />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: SettingSection }) => {
    if (!section.title) return <View className="h-6" />;
    return (
      <View className="px-5 pt-6 pb-2 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
        <Text className="text-xs font-semibold text-[#9CA3AF] dark:text-[#606078] uppercase tracking-wider">
          {section.title}
        </Text>
      </View>
    );
  };

  const renderSeparator = () => <View className="h-px bg-[#E5E7EB] dark:bg-[#2a2a3a] ml-14" />;

  return (
    <SectionList
      className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]"
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      ItemSeparatorComponent={renderSeparator}
      stickySectionHeadersEnabled={false}
      contentContainerClassName="pt-14 pb-28"
    />
  );
}
