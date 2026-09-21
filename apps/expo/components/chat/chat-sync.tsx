import { useChatSync } from "@/hooks/use-chat";
import { useAuth } from "@/lib/auth";

/** Keeps chats current from the socket while signed in. Renders nothing. */
export function ChatSync() {
  const { user } = useAuth();
  useChatSync(user?.id);
  return null;
}
