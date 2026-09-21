import { Stack } from "expo-router";
import { useTheme } from "@/lib/theme";

export default function AuthLayout() {
  const { scheme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: scheme === "dark" ? "#0a0a0f" : "#F4F4F6" },
      }}
    />
  );
}
