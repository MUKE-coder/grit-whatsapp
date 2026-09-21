import { ArrowLeft, Bell, BellOff, ImagePlus, RotateCw, SendHorizontal } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar, clockTime, dayLabel, Ticks } from "@/components/chat/bits";
import { IconButton } from "@/components/chat/sidebar";
import {
  sendInput,
  useConversation,
  useMarkReadWhileOpen,
  useMessages,
  useOnline,
  useSendImage,
  useSendMessage,
  useToggleMute,
} from "@/hooks/use-chat";
import { type ClientEvent, useChannel, useRealtime, useWhisper } from "@/hooks/use-realtime";
import {
  type Conversation,
  conversationTitle,
  displayName,
  type Me,
  type Message,
  otherMember,
  tickFor,
} from "@/lib/chat-api";
import { cn } from "@/lib/utils";

/** How long "typing…" stays up after the last keystroke event. */
const TYPING_TTL_MS = 5000;
/** How often a typist re-announces they are still typing. */
const TYPING_EVERY_MS = 3000;

export function ConversationPane({ id, me, onBack }: { id: string; me: Me; onBack: () => void }) {
  const { data: conv, isError } = useConversation(id);
  const typists = useTyping(id, me.id);

  if (isError) {
    return <Empty>That chat is not available.</Empty>;
  }
  if (!conv) return <Empty>Loading…</Empty>;

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label={conversationTitle(conv, me.id)}>
      <PaneHeader conv={conv} me={me} typists={typists} onBack={onBack} />
      <MessageList conv={conv} me={me} />
      <Composer conversationId={id} me={me} />
    </section>
  );
}

function PaneHeader({
  conv,
  me,
  typists,
  onBack,
}: {
  conv: Conversation;
  me: Me;
  typists: string[];
  onBack: () => void;
}) {
  const other = otherMember(conv, me.id);
  const online = useOnline(other?.id);
  const mute = useToggleMute(conv.id);
  const title = conversationTitle(conv, me.id);

  let status: string;
  if (typists.length > 0) {
    const names = typists
      .map((uid) => conv.members.find((m) => m.id === uid)?.first_name)
      .filter(Boolean)
      .join(", ");
    status = conv.is_group ? `${names} typing…` : "typing…";
  } else if (conv.is_group) {
    status = conv.members.map((m) => (m.id === me.id ? "You" : m.first_name)).join(", ");
  } else {
    status = online ? "online" : "";
  }

  return (
    <header className="flex items-center gap-3 border-border border-b bg-surface px-4 py-2">
      <span className="md:hidden">
        <IconButton label="Back to chats" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </IconButton>
      </span>
      <Avatar id={other?.id ?? conv.id} name={title} src={other?.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-foreground">{title}</h2>
        <p
          className={cn("truncate text-xs", typists.length > 0 ? "text-success" : "text-foreground-secondary")}
          aria-live="polite"
        >
          {status}
        </p>
      </div>
      <IconButton label={conv.muted ? "Unmute" : "Mute"} onClick={() => mute.mutate(!conv.muted)}>
        {conv.muted ? <BellOff className="h-5 w-5" aria-hidden /> : <Bell className="h-5 w-5" aria-hidden />}
      </IconButton>
    </header>
  );
}

function MessageList({ conv, me }: { conv: Conversation; me: Me }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useMessages(conv.id);
  // Pages arrive newest first; the screen shows oldest at the top.
  const messages = useMemo(() => (data ? data.pages.flat().slice().reverse() : []), [data]);
  const latestFromOthers = [...messages].reverse().find((m) => m.sender_id !== me.id)?.id;
  useMarkReadWhileOpen(conv.id, latestFromOthers);

  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const lastId = messages[messages.length - 1]?.id;
  const firstId = messages[0]?.id;
  const previousHeight = useRef(0);

  // New message at the bottom: follow it if you were already at the bottom, or
  // if you sent it. An older page loading at the top: keep your place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new last message should move the view
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const mine = messages[messages.length - 1]?.sender_id === me.id;
    if (pinnedToBottom.current || mine) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: firstId changing is the signal that an older page arrived
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || previousHeight.current === 0) return;
    el.scrollTop += el.scrollHeight - previousHeight.current;
    previousHeight.current = 0;
  }, [firstId]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 200 && hasNextPage && !isFetchingNextPage) {
      previousHeight.current = el.scrollHeight;
      void fetchNextPage();
    }
  };

  const senderName = (m: Message) => {
    const member = conv.members.find((x) => x.id === m.sender_id);
    return member ? displayName(member) : "Someone";
  };

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto bg-surface-2 px-4 py-3 md:px-10"
      role="log"
      aria-label="Messages"
    >
      {isFetchingNextPage && <p className="py-2 text-center text-foreground-muted text-xs">Loading earlier messages…</p>}
      {isLoading && <p className="py-10 text-center text-sm text-foreground-muted">Loading messages…</p>}
      {!isLoading && messages.length === 0 && (
        <p className="mx-auto my-10 max-w-xs rounded-lg bg-surface-3 px-4 py-3 text-center text-sm text-foreground-secondary">
          No messages yet. Say hello.
        </p>
      )}
      <ol className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
          const mine = m.sender_id === me.id;
          const firstOfRun = newDay || prev?.sender_id !== m.sender_id;
          return (
            <Fragment key={m.client_id ?? m.id}>
              {newDay && (
                <li className="my-3 self-center rounded-md bg-surface-3 px-3 py-1 text-foreground-secondary text-xs shadow-sm">
                  {dayLabel(m.created_at)}
                </li>
              )}
              <Bubble
                message={m}
                mine={mine}
                showName={conv.is_group && !mine && firstOfRun}
                name={senderName(m)}
                tick={mine ? tickFor(m, conv, me.id) : undefined}
                spaced={firstOfRun}
                conversationId={conv.id}
                me={me}
              />
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function Bubble({
  message,
  mine,
  showName,
  name,
  tick,
  spaced,
  conversationId,
  me,
}: {
  message: Message;
  mine: boolean;
  showName: boolean;
  name: string;
  tick: ReturnType<typeof tickFor> | undefined;
  spaced: boolean;
  conversationId: string;
  me: Me;
}) {
  const resend = useSendMessage(conversationId, me.id);
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start", spaced && "mt-2")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-1.5 text-sm shadow-sm",
          mine ? "bg-accent text-white" : "bg-surface-3 text-foreground",
        )}
      >
        {showName && <p className="mb-0.5 font-semibold text-success text-xs">{name}</p>}
        {message.kind === "image" && message.attachment && (
          <img
            src={message.attachment.url}
            alt={message.attachment.name || "Photo"}
            className="mb-1 max-h-80 rounded-md object-cover"
          />
        )}
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px]", mine ? "text-white/80" : "text-foreground-muted")}>
          <time dateTime={message.created_at}>{clockTime(message.created_at)}</time>
          {tick && <Ticks tick={tick} onAccent />}
        </p>
        {message.pending === "failed" && (
          <button
            type="button"
            onClick={() =>
              resend.mutate({
                body: message.body,
                kind: message.kind,
                attachment: message.attachment,
                client_id: message.client_id ?? "",
              })
            }
            className="mt-1 flex items-center gap-1 text-white text-xs underline"
          >
            <RotateCw className="h-3 w-3" aria-hidden /> Not sent. Tap to retry
          </button>
        )}
      </div>
    </li>
  );
}

function Composer({ conversationId, me }: { conversationId: string; me: Me }) {
  const [text, setText] = useState("");
  const send = useSendMessage(conversationId, me.id);
  const sendImage = useSendImage(conversationId, me.id);
  const channel = `private-conversations.${conversationId}`;
  const whisper = useWhisper(channel);
  const lastTypingSent = useRef(0);

  // A new conversation starts with an empty box and no one told we are typing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the conversation changes
  useEffect(() => {
    setText("");
    lastTypingSent.current = 0;
  }, [conversationId]);

  const stopTyping = () => {
    if (lastTypingSent.current !== 0) {
      whisper("typing", { on: false });
      lastTypingSent.current = 0;
    }
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    send.mutate(sendInput(body));
    setText("");
    stopTyping();
  };

  return (
    <form
      className="flex items-end gap-2 border-border border-t bg-surface px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="cursor-pointer rounded-full p-2.5 text-foreground-secondary hover:bg-surface-hover hover:text-foreground">
        <span className="sr-only">Send a photo</span>
        <ImagePlus className="h-5 w-5" aria-hidden />
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            for (const file of Array.from(e.target.files ?? [])) void sendImage(file);
            e.target.value = ""; // the same photo can be picked again
          }}
        />
      </label>
      <label className="flex-1">
        <span className="sr-only">Message</span>
        <textarea
          value={text}
          rows={1}
          maxLength={4000}
          placeholder="Type a message"
          onChange={(e) => {
            setText(e.target.value);
            const now = Date.now();
            if (e.target.value && now - lastTypingSent.current > TYPING_EVERY_MS) {
              whisper("typing", { on: true });
              lastTypingSent.current = now;
            }
            if (!e.target.value) stopTyping();
          }}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a new line, as in every chat app.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 w-full resize-none rounded-lg bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-foreground-muted"
        />
      </label>
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label="Send"
        className="rounded-full bg-accent p-2.5 text-white hover:bg-accent-hover disabled:opacity-40"
      >
        <SendHorizontal className="h-5 w-5" aria-hidden />
      </button>
    </form>
  );
}

/**
 * Who is typing in a conversation, from client events on its private channel.
 * Subscribing here is also what lets this browser's own whispers through: the
 * server relays a client event only from a connection subscribed to it.
 */
function useTyping(conversationId: string, meId: string): string[] {
  const [typing, setTyping] = useState<Record<string, number>>({});
  useChannel(`private-conversations.${conversationId}`, {
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
  // Their message arriving means they stopped typing it.
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

  // Expire anyone whose last "typing" is older than the TTL: a closed tab never
  // sends "stopped".
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new conversation starts with nobody typing
  useEffect(() => setTyping({}), [conversationId]);

  return Object.keys(typing);
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-surface-2 text-sm text-foreground-muted">{children}</div>
  );
}
