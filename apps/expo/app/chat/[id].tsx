import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Ticks } from "@/components/chat/bits";
import {
  textInput,
  useActiveChat,
  useConversation,
  useMarkReadWhileOpen,
  useMessages,
  useOnline,
  useSendMessage,
} from "@/hooks/use-chat";
import { type ClientEvent, useChannel, useRealtime, useWhisper } from "@/hooks/use-realtime";
import { useAuth } from "@/lib/auth";
import {
  type Conversation,
  conversationTitle,
  displayName,
  type Message,
  newClientId,
  otherMember,
  tickFor,
} from "@/lib/chat";
import { resolveImageUrl } from "@/lib/images";
import { useTheme } from "@/lib/theme";
import { uploadLocalFile } from "@/lib/upload";

const TYPING_TTL_MS = 5000;
const TYPING_EVERY_MS = 3000;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: conv, isError } = useConversation(id);
  const typists = useTyping(id, user?.id);
  useActiveChat(id);

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-[#0a0a0f]">
        <Text className="text-[#606078]">That chat is not available.</Text>
      </View>
    );
  }
  if (!conv) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-[#0a0a0f]">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#f1f5f9] dark:bg-[#111118]"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header conv={conv} meId={user?.id} typists={typists} top={insets.top} onBack={() => router.back()} />
      <MessageList conv={conv} meId={user?.id} />
      <Composer conversationId={conv.id} meId={user?.id} bottom={insets.bottom} />
    </KeyboardAvoidingView>
  );
}

function Header({
  conv,
  meId,
  typists,
  top,
  onBack,
}: {
  conv: Conversation;
  meId?: string;
  typists: string[];
  top: number;
  onBack: () => void;
}) {
  const other = otherMember(conv, meId);
  const online = useOnline(other?.id);
  const title = conversationTitle(conv, meId);
  let status = conv.is_group
    ? conv.members.map((m) => (m.id === meId ? "You" : m.first_name)).join(", ")
    : online
      ? "online"
      : "";
  if (typists.length > 0) {
    const names = typists.map((uid) => conv.members.find((m) => m.id === uid)?.first_name).filter(Boolean);
    status = conv.is_group ? `${names.join(", ")} typing…` : "typing…";
  }
  return (
    <View
      className="flex-row items-center border-b border-[#e2e8f0] bg-white px-2 pb-2 dark:border-[#2a2a3a] dark:bg-[#0a0a0f]"
      style={{ paddingTop: top + 6 }}
    >
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to chats" className="p-2">
        <Ionicons name="chevron-back" size={26} color="#7c6cf7" />
      </Pressable>
      <Avatar id={other?.id ?? conv.id} name={title} src={other?.avatar} size={38} />
      <View className="ml-3 flex-1">
        <Text numberOfLines={1} className="text-[16px] font-semibold text-[#0f172a] dark:text-[#e8e8f0]">
          {title}
        </Text>
        {status ? (
          <Text
            numberOfLines={1}
            accessibilityLiveRegion="polite"
            className={typists.length > 0 ? "text-xs text-[#10b981]" : "text-xs text-[#606078]"}
          >
            {status}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function MessageList({ conv, meId }: { conv: Conversation; meId?: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useMessages(conv.id);
  // Pages are newest first, which is what an inverted list wants.
  const messages = useMemo(() => data?.pages.flat() ?? [], [data]);
  const latestFromOthers = messages.find((m) => m.sender_id !== meId)?.id;
  useMarkReadWhileOpen(conv.id, latestFromOthers);

  if (isLoading) return <ActivityIndicator className="flex-1" />;
  return (
    <FlatList
      inverted
      data={messages}
      keyExtractor={(m) => m.client_id ?? m.id}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
      renderItem={({ item, index }) => {
        const older = messages[index + 1];
        const mine = item.sender_id === meId;
        const firstOfRun = !older || older.sender_id !== item.sender_id;
        const member = conv.members.find((m) => m.id === item.sender_id);
        return (
          <Bubble
            message={item}
            mine={mine}
            name={conv.is_group && !mine && firstOfRun && member ? displayName(member) : undefined}
            tick={mine ? tickFor(item, conv, meId) : undefined}
            spaced={firstOfRun}
            conversationId={conv.id}
            meId={meId}
          />
        );
      }}
      ListEmptyComponent={
        <Text style={{ transform: [{ scaleY: -1 }] }} className="mt-10 text-center text-[#606078]">
          No messages yet. Say hello.
        </Text>
      }
    />
  );
}

function Bubble({
  message,
  mine,
  name,
  tick,
  spaced,
  conversationId,
  meId,
}: {
  message: Message;
  mine: boolean;
  name?: string;
  tick?: ReturnType<typeof tickFor>;
  spaced: boolean;
  conversationId: string;
  meId?: string;
}) {
  const resend = useSendMessage(conversationId, meId);
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <View className={mine ? "items-end" : "items-start"} style={{ marginTop: spaced ? 8 : 2 }}>
      <View
        className={
          mine
            ? "max-w-[80%] rounded-2xl rounded-br-md bg-[#6c5ce7] px-3 py-2"
            : "max-w-[80%] rounded-2xl rounded-bl-md bg-white px-3 py-2 dark:bg-[#22222e]"
        }
      >
        {name ? <Text className="mb-0.5 text-xs font-semibold text-[#10b981]">{name}</Text> : null}
        {message.kind === "image" && message.attachment ? (
          <Image
            source={{ uri: resolveImageUrl(message.attachment.url) }}
            style={{ width: 220, height: 220, borderRadius: 12, marginBottom: 4 }}
            contentFit="cover"
            accessibilityLabel={message.attachment.name || "Photo"}
          />
        ) : null}
        {message.body ? (
          <Text className={mine ? "text-[15px] text-white" : "text-[15px] text-[#0f172a] dark:text-[#e8e8f0]"}>
            {message.body}
          </Text>
        ) : null}
        <View className="mt-0.5 flex-row items-center justify-end gap-1">
          <Text className={mine ? "text-[11px] text-white/70" : "text-[11px] text-[#606078]"}>{time}</Text>
          {tick ? <Ticks tick={tick} /> : null}
        </View>
        {message.pending === "failed" ? (
          <Pressable
            onPress={() =>
              resend.mutate({
                body: message.body,
                kind: message.kind,
                attachment: message.attachment,
                client_id: message.client_id ?? newClientId(),
              })
            }
            accessibilityRole="button"
          >
            <Text className="mt-1 text-xs text-white underline">Not sent. Tap to retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Composer({ conversationId, meId, bottom }: { conversationId: string; meId?: string; bottom: number }) {
  const { palette } = useTheme();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const send = useSendMessage(conversationId, meId);
  const whisper = useWhisper(`private-conversations.${conversationId}`);
  const lastTypingSent = useRef(0);

  const stopTyping = () => {
    if (lastTypingSent.current !== 0) {
      whisper("typing", { on: false });
      lastTypingSent.current = 0;
    }
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    send.mutate(textInput(body));
    setText("");
    stopTyping();
  };

  const sendPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photos", "Allow access to your photos to send one.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    setUploading(true);
    try {
      const url = await uploadLocalFile(asset.uri, asset.fileName, asset.mimeType);
      send.mutate({
        body: "",
        kind: "image",
        client_id: newClientId(),
        attachment: {
          url,
          key: "",
          name: asset.fileName ?? "photo.jpg",
          mime: asset.mimeType ?? "image/jpeg",
          size: asset.fileSize ?? 0,
        },
      });
    } catch (e) {
      Alert.alert("Photo not sent", e instanceof Error ? e.message : "Please try again");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View
      className="flex-row items-end border-t border-[#e2e8f0] bg-white px-2 pt-2 dark:border-[#2a2a3a] dark:bg-[#0a0a0f]"
      style={{ paddingBottom: Math.max(bottom, 8) }}
    >
      <Pressable
        onPress={sendPhoto}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel="Send a photo"
        className="p-2"
      >
        {uploading ? <ActivityIndicator /> : <Ionicons name="image-outline" size={26} color="#7c6cf7" />}
      </Pressable>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          const now = Date.now();
          if (v && now - lastTypingSent.current > TYPING_EVERY_MS) {
            whisper("typing", { on: true });
            lastTypingSent.current = now;
          }
          if (!v) stopTyping();
        }}
        onBlur={stopTyping}
        placeholder="Message"
        placeholderTextColor={palette.placeholder}
        accessibilityLabel="Message"
        multiline
        maxLength={4000}
        className="max-h-32 flex-1 rounded-2xl bg-[#f1f5f9] px-4 py-2.5 text-[15px] text-[#0f172a] dark:bg-[#1a1a24] dark:text-[#e8e8f0]"
      />
      <Pressable
        onPress={submit}
        disabled={!text.trim()}
        accessibilityRole="button"
        accessibilityLabel="Send"
        className="ml-1 p-2"
        style={{ opacity: text.trim() ? 1 : 0.4 }}
      >
        <Ionicons name="send" size={24} color="#7c6cf7" />
      </Pressable>
    </View>
  );
}

/** Who is typing, from client events on the conversation's private channel. */
function useTyping(conversationId: string | undefined, meId: string | undefined): string[] {
  const [typing, setTyping] = useState<Record<string, number>>({});
  useChannel(conversationId ? `private-conversations.${conversationId}` : null, {
    "client-event:typing": (p: ClientEvent<{ on?: boolean }>) => {
      if (p.user_id === meId) return;
      setTyping((t) => {
        const next = { ...t };
        if (p.data?.on) next[p.user_id] = Date.now() + TYPING_TTL_MS;
        else delete next[p.user_id];
        return next;
      });
    },
  });
  useRealtime({
    "chat.message": (m: Message) => {
      if (m.conversation_id !== conversationId) return;
      setTyping((t) => {
        if (!(m.sender_id in t)) return t;
        const next = { ...t };
        delete next[m.sender_id];
        return next;
      });
    },
  });
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        const live = Object.fromEntries(Object.entries(t).filter(([, until]) => until > now));
        return Object.keys(live).length === Object.keys(t).length ? t : live;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return Object.keys(typing);
}
