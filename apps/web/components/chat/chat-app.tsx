"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ConversationPane } from "@/components/chat/conversation-pane";
import { Sidebar } from "@/components/chat/sidebar";
import { useChatSync, useMe } from "@/hooks/use-chat";
import { disconnectRealtime } from "@/hooks/use-realtime";
import { logout } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

/**
 * The whole chat: inbox on the left, the open conversation on the right. The
 * open conversation is ?c=<id>, so it survives a reload and the back button
 * works. On a phone-width screen only one of the two shows at a time.
 */
export function ChatApp() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const activeId = params.get("c");
  const { data: me, isLoading, isError } = useMe();

  useChatSync(me, activeId);

  useEffect(() => {
    if (isError) router.replace("/login");
  }, [isError, router]);

  const open = (id: string | null) => router.push(id ? `${pathname}?c=${id}` : pathname);

  const signOut = async () => {
    try {
      await logout();
    } finally {
      disconnectRealtime();
      qc.clear();
      router.replace("/login");
    }
  };

  if (isLoading || !me) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg-tertiary text-sm text-text-muted">
        Loading your chats…
      </div>
    );
  }

  return (
    <div className="grid h-dvh grid-cols-1 md:grid-cols-[minmax(320px,400px)_1fr]">
      <div className={cn("min-h-0", activeId && "hidden md:block")}>
        <Sidebar me={me} activeId={activeId} onOpen={open} onSignOut={signOut} />
      </div>
      <div className={cn("min-h-0", !activeId && "hidden md:block")}>
        {activeId ? (
          <ConversationPane key={activeId} id={activeId} me={me} onBack={() => open(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg-tertiary px-6 text-center">
            <MessageCircle className="h-12 w-12 text-text-muted" aria-hidden />
            <h2 className="font-semibold text-foreground text-lg">Grit Chat</h2>
            <p className="max-w-sm text-sm text-text-secondary">
              Pick a chat on the left, or start a new one. Messages arrive live, with typing indicators and read
              receipts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
