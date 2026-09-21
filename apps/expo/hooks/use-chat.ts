import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { usePresence, useRealtime } from "@/hooks/use-realtime";
import {
  chatApi,
  type Conversation,
  MESSAGE_PAGE,
  type Message,
  newClientId,
  type Receipt,
  type SendInput,
} from "@/lib/chat";

export const chatKeys = {
  conversations: ["chat", "conversations"] as const,
  conversation: (id: string) => ["chat", "conversation", id] as const,
  messages: (id: string) => ["chat", "messages", id] as const,
  users: (search: string) => ["chat", "users", search] as const,
};

type MessagePages = InfiniteData<Message[], string | undefined>;

export function useConversations() {
  return useQuery({ queryKey: chatKeys.conversations, queryFn: chatApi.conversations });
}

export function useConversation(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: chatKeys.conversation(id ?? ""),
    queryFn: () => chatApi.conversation(id as string),
    enabled: !!id,
    initialData: () => qc.getQueryData<Conversation[]>(chatKeys.conversations)?.find((c) => c.id === id),
  });
}

export function useMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId ?? ""),
    queryFn: ({ pageParam }) => chatApi.messages(conversationId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length < MESSAGE_PAGE ? undefined : last[last.length - 1]?.id),
    enabled: !!conversationId,
    staleTime: Number.POSITIVE_INFINITY, // kept current by realtime
  });
}

export function useUserSearch(search: string) {
  return useQuery({ queryKey: chatKeys.users(search), queryFn: () => chatApi.users(search) });
}

function upsertMessage(qc: QueryClient, msg: Message) {
  qc.setQueryData<MessagePages>(chatKeys.messages(msg.conversation_id), (data) => {
    if (!data) return data;
    const matches = (m: Message) => m.id === msg.id || (!!msg.client_id && m.client_id === msg.client_id);
    let replaced = false;
    const pages = data.pages.map((page) =>
      page.map((m) => {
        if (!matches(m)) return m;
        replaced = true;
        return { ...msg, pending: undefined };
      }),
    );
    if (!replaced) pages[0] = [msg, ...(pages[0] ?? [])];
    return { ...data, pages };
  });
}

function patchInbox(qc: QueryClient, id: string, patch: (c: Conversation) => Conversation): boolean {
  let found = false;
  qc.setQueryData<Conversation[]>(chatKeys.conversations, (list) => {
    if (!list) return list;
    const next = list.map((c) => {
      if (c.id !== id) return c;
      found = true;
      return patch(c);
    });
    return next.sort((a, b) => Date.parse(b.last_message_at ?? "0") - Date.parse(a.last_message_at ?? "0"));
  });
  qc.setQueryData<Conversation>(chatKeys.conversation(id), (c) => (c ? patch(c) : c));
  return found;
}

/** Optimistic send: shown at once as "sending", replaced by the saved message, "failed" if it is not. */
export function useSendMessage(conversationId: string, meId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendInput) => chatApi.send(conversationId, input),
    onMutate: (input) => {
      upsertMessage(qc, {
        id: `local-${input.client_id}`,
        conversation_id: conversationId,
        sender_id: meId ?? "",
        body: input.body,
        kind: input.kind,
        attachment: input.attachment ?? null,
        client_id: input.client_id,
        created_at: new Date().toISOString(),
        pending: "sending",
      });
    },
    onSuccess: (saved) => upsertMessage(qc, saved),
    onError: (_err, input) =>
      qc.setQueryData<MessagePages>(chatKeys.messages(conversationId), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) =>
                p.map((m) => (m.client_id === input.client_id ? { ...m, pending: "failed" } : m)),
              ),
            }
          : data,
      ),
  });
}

export function textInput(body: string): SendInput {
  return { body, kind: "text", client_id: newClientId() };
}

export function useStartDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: chatApi.direct,
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations }),
  });
}

/** Marks a conversation read while it is on screen and the app is in the foreground. */
export function useMarkReadWhileOpen(conversationId: string | undefined, latestFromOthers: string | undefined) {
  const qc = useQueryClient();
  // latestFromOthers is the trigger: a new message from someone else re-marks the chat read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!conversationId) return undefined;
    const mark = () => {
      if (AppState.currentState !== "active") return;
      patchInbox(qc, conversationId, (c) => ({ ...c, unread: 0 }));
      chatApi.read(conversationId).catch(() => undefined);
    };
    mark();
    const sub = AppState.addEventListener("change", mark);
    return () => sub.remove();
  }, [conversationId, latestFromOthers, qc]);
}

// The conversation on screen, set by the chat screen while it is mounted. Its
// messages are marked read on arrival; every other conversation's delivered.
let activeChat: string | undefined;

export function useActiveChat(id: string | undefined) {
  useEffect(() => {
    activeChat = id;
    return () => {
      if (activeChat === id) activeChat = undefined;
    };
  }, [id]);
}

/** Keeps every chat cache current from the socket. Mount once, while signed in. */
export function useChatSync(meId: string | undefined) {
  const qc = useQueryClient();

  // Your own presence channel: the people you chat with watch it to see you online.
  usePresence(meId ? `presence-users.${meId}` : null);

  const { data: inbox } = useConversations();
  const deliveredOnce = useRef(false);
  useEffect(() => {
    if (!inbox || deliveredOnce.current) return;
    deliveredOnce.current = true;
    for (const c of inbox) {
      if (c.unread > 0) chatApi.delivered(c.id).catch(() => undefined);
    }
  }, [inbox]);

  useRealtime({
    "chat.message": (payload: Message) => {
      upsertMessage(qc, payload);
      const mine = payload.sender_id === meId;
      const open = activeChat === payload.conversation_id && AppState.currentState === "active";
      const known = patchInbox(qc, payload.conversation_id, (c) => ({
        ...c,
        last_message_at: payload.created_at,
        last_message_preview: payload.kind === "text" ? payload.body : c.last_message_preview,
        unread: mine || open ? c.unread : c.unread + 1,
      }));
      if (!known || payload.kind !== "text") qc.invalidateQueries({ queryKey: chatKeys.conversations });
      if (!mine) (open ? chatApi.read : chatApi.delivered)(payload.conversation_id).catch(() => undefined);
    },
    "chat.receipt": (payload: Receipt) => {
      patchInbox(qc, payload.conversation_id, (c) => ({
        ...c,
        members: c.members.map((m) =>
          m.id === payload.user_id
            ? { ...m, last_read_at: payload.last_read_at, last_delivered_at: payload.last_delivered_at }
            : m,
        ),
      }));
    },
    "chat.conversation": () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

export function useOnline(userId: string | undefined): boolean {
  const members = usePresence(userId ? `presence-users.${userId}` : null);
  return !!userId && members.some((m) => m.user_id === userId);
}
