import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Switch, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { pickAndUploadImage } from "@/lib/upload";
import { useCreateBlog } from "@/hooks/use-blogs";

export default function CreateBlogScreen() {
  const router = useRouter();
  const create = useCreateBlog();
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-3.5 text-[#0F1018] dark:text-white text-[15px] mb-4";
  const labelClass = "text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2";

  const onPickImage = async () => {
    try {
      const url = await pickAndUploadImage();
      if (url) setImage(url);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Please try again");
    }
  };

  const onSubmit = async () => {
    setError("");
    if (!title.trim()) return setError("Title is required");
    setSaving(true);
    try {
      await create.mutateAsync({ title, excerpt, content, image: image || "", published });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to create post");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="New Post" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
            <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{error}</Text>
          </View>
        ) : null}

        <Text className={labelClass}>Cover image</Text>
        <Pressable onPress={onPickImage} className="mb-4 h-40 rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#2a2a3a] items-center justify-center overflow-hidden bg-white dark:bg-[#111118]">
          {image ? (
            <Image source={{ uri: image }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <View className="items-center">
              <Ionicons name="cloud-upload-outline" size={28} color="#9CA3AF" />
              <Text className="text-[#6B7280] dark:text-[#9090a8] mt-2 text-[13px]">Tap to upload</Text>
            </View>
          )}
        </Pressable>

        <Text className={labelClass}>Title</Text>
        <TextInput className={inputClass} placeholder="Title" placeholderTextColor="#9CA3AF" value={title} onChangeText={setTitle} />
        <Text className={labelClass}>Excerpt</Text>
        <TextInput className={inputClass} placeholder="Short summary" placeholderTextColor="#9CA3AF" value={excerpt} onChangeText={setExcerpt} />
        <Text className={labelClass}>Content</Text>
        <TextInput className={inputClass} placeholder="Write your post..." placeholderTextColor="#9CA3AF" value={content} onChangeText={setContent} multiline numberOfLines={6} style={{ minHeight: 140, textAlignVertical: "top" }} />

        <View className="flex-row items-center justify-between mb-4">
          <Text className={labelClass} style={{ marginBottom: 0 }}>Published</Text>
          <Switch value={published} onValueChange={setPublished} trackColor={{ false: "#D1D5DB", true: "#6c5ce7" }} thumbColor="#ffffff" />
        </View>

        <Pressable onPress={onSubmit} disabled={saving} className="bg-[#6c5ce7] rounded-full py-4 items-center mt-2" style={{ opacity: saving ? 0.7 : 1 }}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-[15px]">Publish post</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}
