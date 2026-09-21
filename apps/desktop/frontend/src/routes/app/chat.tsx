import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { ConversationPane } from "@/components/chat/conversation-pane";
import { Sidebar } from "@/components/chat/sidebar";
import { useLogout, useMe } from "@/hooks/use-auth";
import { useChatSync } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

// The open conversation is ?c=<id>, so it survives a reload and back works.
export const Route = createFileRoute("/app/chat")({
  validateSearch: (search: Record<string, unknown>): { c?: string } => ({
    c: typeof search.c === "string" && search.c !== "" ? search.c : undefined,
  }),
  component: ChatPage,
});

/**
 * The chat inside the desktop shell: inbox on the left, the open conversation
 * on the right. The same components as the web app, over the desktop's own
 * API client, router and theme.
 */
function ChatPage() {
  const { c: activeId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: me, isLoading } = useMe();
  const logout = useLogout();

  useChatSync(me, activeId ?? null);

  const open = (id: string | null) => navigate({ to: "/app/chat", search: { c: id ?? undefined } });

  if (isLoading || !me) {
    return <div className="flex h-full items-center justify-center text-sm text-foreground-muted">Loading your chats…</div>;
  }

  return (
    // The shell pads its content area; the chat fills it edge to edge.
    <div
      // The shell's floating quick-access button sits bottom right: keep the
      // composer's send button clear of it.
      className="grid grid-cols-[minmax(300px,380px)_1fr] overflow-hidden border-border border-t [&_section_form]:pr-20"
      style={{ margin: "-2rem", height: "calc(100% + 4rem)" }}
    >
      <div className="min-h-0">
        <Sidebar me={me} activeId={activeId ?? null} onOpen={open} onSignOut={() => logout.mutate()} />
      </div>
      <div className={cn("min-h-0")}>
        {activeId ? (
          <ConversationPane key={activeId} id={activeId} me={me} onBack={() => open(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-2 px-6 text-center">
            <MessageCircle className="h-12 w-12 text-foreground-muted" aria-hidden />
            <h2 className="font-semibold text-foreground text-lg">Grit Chat</h2>
            <p className="max-w-sm text-foreground-secondary text-sm">
              Pick a chat on the left, or start a new one. Messages arrive live, with typing indicators and read
              receipts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
