import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme";

// Floating glass tab bar. iOS gets a native frosted-blur background;
// Android falls back to a solid surface. Colours follow the active theme.
export default function TabsLayout() {
  const { palette, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  // Lift the floating bar above the OS gesture/nav area so it isn't clipped
  // by the Android system navigation at the very bottom of the screen.
  const barBottom = Math.max(insets.bottom, 10) + 6;
  const blurBg =
    scheme === "dark" ? "rgba(17,17,24,0.6)" : "rgba(255,255,255,0.7)";
  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync().catch(() => {});
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#7c6cf7",
        tabBarInactiveTintColor: palette.tabInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarItemStyle: {
          paddingTop: 6,
        },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => (
                <BlurView
                  tint={palette.blurTint}
                  intensity={40}
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: blurBg, borderRadius: 24, overflow: "hidden" },
                  ]}
                />
              )
            : () => (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: palette.tabBar, borderRadius: 24 },
                  ]}
                />
              ),
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: barBottom,
          height: 64,
          paddingBottom: 8,
          borderRadius: 24,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: palette.tabBarBorder,
          backgroundColor: "transparent",
          elevation: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: scheme === "dark" ? 0.35 : 0.12,
          shadowRadius: 16,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
