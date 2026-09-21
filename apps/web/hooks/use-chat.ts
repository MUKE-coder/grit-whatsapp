"use client";

import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { usePresence, useRealtime } from "@/hooks/use-realtime";
import {
  type Conversation,
  createGroup,
  fetchConversation,
  fetchConversations,
  fetchMe,
  fetchMessages,
  fetchUsers,
  MESSAGE_PAGE,
  type Me,
  type Message,
  type MessageKind,
  markDelivered,
  markRead,
  newClientId,
  type Receipt,
  sendMessage,
  setMuted,
  startDirect,
} from "@/lib/chat-api";

export const chatKeys = {
  me: ["chat", "me"] as const,
  conversations: ["chat", "conversations"] as const,
  conversation: (id: string) => ["chat", "conversation", id] as const,
  messages: (id: string) => ["chat", "messages", id] as const,
  users: (search: string) => ["chat", "users", search] as const,
};

type MessagePages = InfiniteData<Message[], string | undefined>;

export function useMe() {
  return useQuery<Me>({ queryKey: chatKeys.me, queryFn: fetchMe, retry: false, staleTime: 5 * 60_000 });
}

export function useConversations() {
  return useQuery({ queryKey: chatKeys.conversations, queryFn: fetchConversations });
}

/** One conversation, read from the inbox when it is there and fetched when not. */
export function useConversation(id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: chatKeys.conversation(id ?? ""),
    queryFn: () => fetchConversation(id as string),
    enabled: !!id,
    initialData: () => qc.getQueryData<Conversation[]>(chatKeys.conversations)?.find((c) => c.id === id),
  });
}

export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId ?? ""),
    queryFn: ({ pageParam }) => fetchMessages(conversationId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    // Pages run newest to oldest; the next page is older than the last message.
    getNextPageParam: (last) => (last.length < MESSAGE_PAGE ? undefined : last[last.length - 1]?.id),
    enabled: !!conversationId,
    staleTime: Number.POSITIVE_INFINITY, // kept current by realtime, not by refetching
  });
}

export function useUserSearch(search: string, enabled: boolean) {
  return useQuery({ queryKey: chatKeys.users(search), queryFn: () => fetchUsers(search), enabled });
}

// ---- cache edits ----------------------------------------------------------------

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

// ---- sending -------------------------------------------------------------------

/**
 * Sends optimistically: the message appears at once as "sending", becomes the
 * saved message when the server answers (matched by client_id), and is marked
 * "failed" if it does not, so it can be retried.
 */
export function useSendMessage(conversationId: string, meId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; kind: MessageKind; client_id: string }) =>
      sendMessage(conversationId, input),
    onMutate: (input) => {
      upsertMessage(qc, {
        id: `local-${input.client_id}`,
        conversation_id: conversationId,
        sender_id: meId ?? "",
        body: input.body,
        kind: input.kind,
        attachment: null,
        client_id: input.client_id,
        created_at: new Date().toISOString(),
        pending: "sending",
      });
    },
    onSuccess: (saved) => upsertMessage(qc, saved),
    onError: (_err, input) => {
      qc.setQueryData<MessagePages>(chatKeys.messages(conversationId), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) =>
                p.map((m) => (m.client_id === input.client_id ? { ...m, pending: "failed" } : m)),
              ),
            }
          : data,
      );
    },
  });
}

export function sendInput(body: string) {
  return { body, kind: "text" as const, client_id: newClientId() };
}

export function useStartDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startDirect,
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations }),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, memberIds }: { title: string; memberIds: string[] }) => createGroup(title, memberIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations }),
  });
}

export function useToggleMute(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => setMuted(conversationId, muted),
    onSuccess: (_d, muted) => {
      patchInbox(qc, conversationId, (c) => ({ ...c, muted }));
    },
  });
}

// ---- reading -------------------------------------------------------------------

/**
 * Marks a conversation read while it is open and the tab is visible: on open,
 * and again whenever a message arrives from someone else.
 */
export function useMarkReadWhileOpen(conversationId: string | null, latestFromOthers: string | undefined) {
  const qc = useQueryClient();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new message from someone else is what re-marks the chat read
  useEffect(() => {
    if (!conversationId) return undefined;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      patchInbox(qc, conversationId, (c) => ({ ...c, unread: 0 }));
      markRead(conversationId).catch(() => undefined); // the next open tries again
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [conversationId, latestFromOthers, qc]);
}

// ---- realtime ----------------------------------------------------------------------

/**
 * Keeps every chat cache current from the socket. Mount once, in the chat
 * layout. activeId is the open conversation, whose messages are read on
 * arrival; every other conversation's are only marked delivered.
 */
export function useChatSync(me: Me | undefined, activeId: string | null) {
  const qc = useQueryClient();
  const active = useRef(activeId);
  active.current = activeId;

  // Your own presence channel: the people you chat with watch it to see you online.
  usePresence(me ? `presence-users.${me.id}` : null);

  // Anything already waiting when the app opens has now reached this device.
  const { data: inbox } = useConversations();
  const deliveredOnce = useRef(false);
  useEffect(() => {
    if (!inbox || deliveredOnce.current) return;
    deliveredOnce.current = true;
    for (const c of inbox) {
      if (c.unread > 0) markDelivered(c.id).catch(() => undefined);
    }
  }, [inbox]);

  useRealtime({
    "chat.message": (payload: Message) => {
      upsertMessage(qc, payload);
      const mine = payload.sender_id === me?.id;
      const open = active.current === payload.conversation_id && document.visibilityState === "visible";
      const known = patchInbox(qc, payload.conversation_id, (c) => ({
        ...c,
        last_message_at: payload.created_at,
        last_message_preview: payload.kind === "text" ? payload.body : c.last_message_preview,
        unread: mine || open ? c.unread : c.unread + 1,
      }));
      if (!known || payload.kind !== "text") qc.invalidateQueries({ queryKey: chatKeys.conversations });
      if (!mine) {
        const mark = open ? markRead : markDelivered;
        mark(payload.conversation_id).catch(() => undefined);
      }
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

/** Whether a user has the app open anywhere, from their presence channel. */
export function useOnline(userId: string | undefined): boolean {
  const members = usePresence(userId ? `presence-users.${userId}` : null);
  return !!userId && members.some((m) => m.user_id === userId);
}
