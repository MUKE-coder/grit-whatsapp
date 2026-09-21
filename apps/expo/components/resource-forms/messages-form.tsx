import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Switch, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import { Image } from "expo-image";
import { uploadLocalFile } from "@/lib/upload";
import { resolveImageUrl } from "@/lib/images";
import { ImagePickerSheet } from "@/components/ui/image-picker-sheet";
import { useConversations } from "@/hooks/use-conversations";
import { RelationSelect } from "@/components/ui/relation-select";
import { useUsers } from "@/hooks/use-users";

export interface MessageFormProps {
  initial?: Record<string, any>;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
}

// Shared create/edit form. Renders inside a page or a bottom sheet; the parent
// owns the mutation and navigation via onSubmit.
export function MessageForm({ initial, onSubmit, submitting, submitLabel }: MessageFormProps) {
  const i: any = initial || {};
  const [error, setError] = useState("");
  const [conversationID, setConversationID] = useState(i.conversation_id ?? "");
  const [senderID, setSenderID] = useState(i.sender_id ?? "");
  const [body, setBody] = useState(i.body ?? "");
  const [kind, setKind] = useState(i.kind ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(i.attachment?.url ?? null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const conversationsQuery = useConversations("", {}, "created_at", "desc", 500);
  const conversationsOpts = conversationsQuery.data?.pages.flatMap((p: any) => p.data) ?? [];
  const usersQuery = useUsers("", {}, "created_at", "desc", 500);
  const usersOpts = usersQuery.data?.pages.flatMap((p: any) => p.data) ?? [];
  const inputClass =
    "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-3.5 text-[#0F1018] dark:text-white text-[15px] mb-4";
  const labelClass = "text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2";

  // One picker sheet serves every image field. openPicker aims it at the tapped
  // field (single or multi), we show the picked LOCAL images instantly, upload
  // them in the background, then hand back the stored URLs for the payload.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMultiple, setPickerMultiple] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pickerTarget = useRef<{ onPreview: (uris: string[]) => void; onUploaded: (urls: string[]) => void } | null>(null);

  const openPicker = (
    multiple: boolean,
    onPreview: (uris: string[]) => void,
    onUploaded: (urls: string[]) => void,
  ) => {
    pickerTarget.current = { onPreview, onUploaded };
    setPickerMultiple(multiple);
    setPickerOpen(true);
  };

  const onImagesSelected = async (uris: string[]) => {
    setPickerOpen(false);
    const target = pickerTarget.current;
    if (!uris.length || !target) return;
    target.onPreview(uris);
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const uri of uris) {
        urls.push(await uploadLocalFile(uri));
      }
      target.onUploaded(urls);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Please try again");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setError("");
    if (!conversationID) return setError("Conversation is required");
    if (!senderID) return setError("Sender is required");
    try {
      await onSubmit({
        conversation_id: conversationID,
        sender_id: senderID,
        body: body,
        kind: kind,
        attachment: attachmentUrl ? { url: attachmentUrl } : undefined,
      });
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    }
  };

  return (
    <View>
      {error ? (
        <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
          <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
          <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{error}</Text>
        </View>
      ) : null}

      <RelationSelect label="Conversation" value={conversationID} onChange={setConversationID} options={conversationsOpts} />
      <RelationSelect label="Sender" value={senderID} onChange={setSenderID} options={usersOpts} />
        <Text className={labelClass}>Body</Text>
        <TextInput className={inputClass} placeholder="Body" placeholderTextColor="#9CA3AF" value={body} onChangeText={setBody} multiline numberOfLines={4} style={{ minHeight: 96, textAlignVertical: "top" }} />
        <Text className={labelClass}>Kind</Text>
        <TextInput className={inputClass} placeholder="Kind" placeholderTextColor="#9CA3AF" value={kind} onChangeText={setKind} />
      <Text className={labelClass}>Attachment</Text>
      <Pressable onPress={() => openPicker(false, (u) => setAttachmentPreview(u[0]), (urls) => setAttachmentUrl(urls[0]))} className="mb-4 h-40 rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#2a2a3a] items-center justify-center overflow-hidden bg-white dark:bg-[#111118]">
        {attachmentPreview ? (
          <>
            <Image source={{ uri: attachmentPreview }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            {uploading ? (
              <View className="absolute inset-0 items-center justify-center bg-black/30"><ActivityIndicator color="#fff" /></View>
            ) : null}
          </>
        ) : attachmentUrl ? (
          <Image source={{ uri: resolveImageUrl(attachmentUrl) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <View className="items-center">
            <Ionicons name="image-outline" size={28} color="#9CA3AF" />
            <Text className="text-[#6B7280] dark:text-[#9090a8] mt-2 text-[13px]">Tap to add a photo</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={submit}
        disabled={submitting}
        className="bg-[#6c5ce7] rounded-full py-4 items-center mt-2"
        style={{ opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold text-[15px]">{submitLabel || "Save"}</Text>
        )}
      </Pressable>
      <ImagePickerSheet visible={pickerOpen} multiple={pickerMultiple} onClose={() => setPickerOpen(false)} onSelect={onImagesSelected} />
    </View>
  );
}
