import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useChatSync } from "@/hooks/use-chat";
import { useAuth } from "@/lib/auth";
import { onNotificationTap, registerForPush } from "@/lib/push";

/**
 * Keeps chats current from the socket while signed in, registers this device
 * for push, and opens the chat a tapped notification is about. Renders nothing.
 */
export function ChatSync() {
  const { user } = useAuth();
  const router = useRouter();
  useChatSync(user?.id);

  // On every launch while signed in: re-registering is how the API tells a
  // live device from one whose app was deleted.
  useEffect(() => {
    if (user?.id) void registerForPush();
  }, [user?.id]);

  useEffect(
    () =>
      onNotificationTap((data) => {
        if (data.conversation_id) router.push(`/chat/${data.conversation_id}`);
      }),
    [router],
  );
  return null;
}
