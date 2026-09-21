import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { pickAndUploadImage } from "@/lib/upload";
import { Ionicons } from "@expo/vector-icons";

const profileSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
});

type ProfileForm = z.infer<typeof profileSchema>;

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center px-5 py-4">
      <Ionicons name={icon as any} size={20} color="#9090a8" />
      <Text className="text-sm text-[#6B7280] dark:text-[#9090a8] ml-3 flex-1">{label}</Text>
      <Text className="text-sm text-[#0F1018] dark:text-white">{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState("");

  const onChangeAvatar = async () => {
    try {
      setUploadingAvatar(true);
      const url = await pickAndUploadImage();
      if (url) {
        await api.put("/profile", { avatar: url });
        await refreshUser();
      }
    } catch (err: any) {
      Alert.alert("Upload failed", err.message || "Could not update your photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const displayName =
    (user?.first_name || "") + " " + (user?.last_name || "") || user?.name || "User";
  const initials =
    (user?.first_name?.charAt(0) || user?.name?.charAt(0) || "U").toUpperCase();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.first_name || "",
      lastName: user?.last_name || "",
      email: user?.email || "",
    },
  });

  const onSave = async (data: ProfileForm) => {
    setError("");
    setSaving(true);
    try {
      await api.put("/profile", {
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
      });
      await refreshUser();
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    reset();
    setError("");
    setEditing(false);
  };

  if (editing) {
    return (
      <ScrollView className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]" contentContainerClassName="px-6 pt-16 pb-28">
        <Text className="text-2xl font-bold text-[#0F1018] dark:text-white mb-6">Edit Profile</Text>

        {error ? (
          <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 rounded-xl p-4 mb-6">
            <Text className="text-[#ff6b6b] text-sm">{error}</Text>
          </View>
        ) : null}

        <View className="mb-4">
          <Text className="text-sm text-[#6B7280] dark:text-[#9090a8] mb-2">First name</Text>
          <Controller
            control={control}
            name="firstName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-xl px-4 py-3.5 text-[#0F1018] dark:text-white text-base"
                placeholder="First name"
                placeholderTextColor="#606078"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
          {errors.firstName ? (
            <Text className="text-[#ff6b6b] text-xs mt-1">{errors.firstName.message}</Text>
          ) : null}
        </View>

        <View className="mb-4">
          <Text className="text-sm text-[#6B7280] dark:text-[#9090a8] mb-2">Last name</Text>
          <Controller
            control={control}
            name="lastName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-xl px-4 py-3.5 text-[#0F1018] dark:text-white text-base"
                placeholder="Last name"
                placeholderTextColor="#606078"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
          {errors.lastName ? (
            <Text className="text-[#ff6b6b] text-xs mt-1">{errors.lastName.message}</Text>
          ) : null}
        </View>

        <View className="mb-6">
          <Text className="text-sm text-[#6B7280] dark:text-[#9090a8] mb-2">Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-xl px-4 py-3.5 text-[#0F1018] dark:text-white text-base"
                placeholder="Email"
                placeholderTextColor="#606078"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}
          />
          {errors.email ? (
            <Text className="text-[#ff6b6b] text-xs mt-1">{errors.email.message}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          className={`rounded-xl py-4 items-center mb-3 ${saving ? "bg-[#6c5ce7]/50" : "bg-[#6c5ce7]"}`}
          onPress={handleSubmit(onSave)}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">Save changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-xl py-4 items-center border border-[#E5E7EB] dark:border-[#2a2a3a]"
          onPress={onCancel}
          activeOpacity={0.8}
        >
          <Text className="text-[#6B7280] dark:text-[#9090a8] font-semibold text-base">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]" contentContainerClassName="px-6 pt-16 pb-28">
      <View className="items-center mb-8 mt-4">
        <TouchableOpacity onPress={onChangeAvatar} activeOpacity={0.85} className="mb-4">
          <View className="w-24 h-24 rounded-full bg-[#6c5ce7] items-center justify-center overflow-hidden">
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <Text className="text-3xl font-bold text-white">{initials}</Text>
            )}
          </View>
          <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#6c5ce7] border-2 border-[#F4F4F6] dark:border-[#0a0a0f] items-center justify-center">
            {uploadingAvatar ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="camera" size={15} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-[#0F1018] dark:text-white">{displayName.trim()}</Text>
        <Text className="text-sm text-[#6B7280] dark:text-[#9090a8] mt-1">{user?.email}</Text>
        <View className="bg-[#6c5ce7]/20 px-3 py-1 rounded-full mt-2">
          <Text className="text-[#6c5ce7] text-xs font-medium capitalize">
            {user?.role || "user"}
          </Text>
        </View>
      </View>

      <View className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl overflow-hidden mb-6">
        <ProfileRow icon="person-outline" label="Full Name" value={displayName.trim()} />
        <View className="h-px bg-[#E5E7EB] dark:bg-[#2a2a3a]" />
        <ProfileRow icon="mail-outline" label="Email" value={user?.email || "—"} />
        <View className="h-px bg-[#E5E7EB] dark:bg-[#2a2a3a]" />
        <ProfileRow icon="shield-outline" label="Role" value={user?.role || "user"} />
      </View>

      <TouchableOpacity
        className="bg-[#6c5ce7] rounded-2xl py-4 items-center mb-3"
        onPress={() => setEditing(true)}
        activeOpacity={0.8}
      >
        <Text className="text-white font-semibold text-base">Edit Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl py-4 items-center mb-3 flex-row justify-center"
        onPress={() => router.push("/change-password")}
        activeOpacity={0.8}
      >
        <Ionicons name="lock-closed-outline" size={18} color="#6c5ce7" />
        <Text className="text-[#0F1018] dark:text-white font-semibold text-base ml-2">Change Password</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 rounded-2xl py-4 items-center"
        onPress={logout}
        activeOpacity={0.8}
      >
        <Text className="text-[#ff6b6b] font-semibold text-base">Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
