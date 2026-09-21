import { useState } from "react";
import { View, Text, TextInput, ActivityIndicator, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenHeader } from "@/components/ui/screen-header";
import { api } from "@/lib/api";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");

    setLoading(true);
    try {
      await api.put("/profile", { password });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Password changed", "Your password has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const field = "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl flex-row items-center px-4";

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="Change Password" subtitle="Choose a new password" showBack />
      <View className="px-6 pt-2">
        {error ? (
          <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
            <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{error}</Text>
          </View>
        ) : null}

        <Text className="text-[12.5px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2">New password</Text>
        <View className={field} style={{ height: 52 }}>
          <Ionicons name="lock-closed-outline" size={17} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
            placeholder="Min. 8 characters"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            autoCapitalize="none"
          />
          <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} className="p-1">
            <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={19} color={show ? "#6c5ce7" : "#9CA3AF"} />
          </Pressable>
        </View>

        <Text className="text-[12.5px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2 mt-4">Confirm password</Text>
        <View className={field} style={{ height: 52 }}>
          <Ionicons name="lock-closed-outline" size={17} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
            placeholder="Repeat password"
            placeholderTextColor="#9CA3AF"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!show}
            autoCapitalize="none"
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={loading}
          className="bg-[#6c5ce7] rounded-full py-4 items-center mt-6"
          style={{ opacity: loading ? 0.7 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-[15px]">Update password</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
