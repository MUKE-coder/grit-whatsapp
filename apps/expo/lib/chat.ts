// The chat API for the mobile app. The same routes, types and tick rules as
// apps/web/lib/chat-api.ts; only the HTTP client differs (a bearer token here,
// a cookie there).
import { api } from "@/lib/api";

export interface ChatUser {
  id: string;
  first_name: string;
  last_name: string;
  avatar: string;
}

export interface Member extends ChatUser {
  role: "member" | "admin";
  last_read_at: string | null;
  last_delivered_at: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  is_group: boolean;
  last_message_at: string | null;
  last_message_preview: string;
  unread: number;
  muted: boolean;
  members: Member[];
}

export interface Attachment {
  url: string;
  key: string;
  name: string;
  mime: string;
  size: number;
}

export type MessageKind = "text" | "image" | "file";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: MessageKind;
  attachment: Attachment | null;
  client_id?: string;
  created_at: string;
  /** Client-side only: still on its way, or failed. */
  pending?: "sending" | "failed";
}

export interface Receipt {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
  last_delivered_at: string | null;
}

export interface SendInput {
  body: string;
  kind: MessageKind;
  client_id: string;
  attachment?: Attachment | null;
}

export const MESSAGE_PAGE = 40;

export const chatApi = {
  users: async (search: string): Promise<ChatUser[]> =>
    (await api.get(`/chat/users?search=${encodeURIComponent(search)}`)).data,
  conversations: async (): Promise<Conversation[]> => (await api.get("/chat/conversations")).data,
  conversation: async (id: string): Promise<Conversation> => (await api.get(`/chat/conversations/${id}`)).data,
  direct: async (userId: string): Promise<Conversation> =>
    (await api.post("/chat/conversations/direct", { user_id: userId })).data,
  messages: async (id: string, before?: string): Promise<Message[]> =>
    (await api.get(`/chat/conversations/${id}/messages?limit=${MESSAGE_PAGE}${before ? `&before=${before}` : ""}`))
      .data,
  send: async (id: string, input: SendInput): Promise<Message> =>
    (await api.post(`/chat/conversations/${id}/messages`, input)).data,
  read: async (id: string): Promise<void> => {
    await api.post(`/chat/conversations/${id}/read`, {});
  },
  delivered: async (id: string): Promise<void> => {
    await api.post(`/chat/conversations/${id}/delivered`, {});
  },
};

export function displayName(user: Pick<ChatUser, "first_name" | "last_name">): string {
  return `${user.first_name} ${user.last_name}`.trim();
}

export function conversationTitle(conv: Conversation, meId: string | undefined): string {
  if (conv.is_group) return conv.title;
  const other = conv.members.find((m) => m.id !== meId);
  return other ? displayName(other) : "Just you";
}

export function otherMember(conv: Conversation, meId: string | undefined): Member | undefined {
  return conv.is_group ? undefined : conv.members.find((m) => m.id !== meId);
}

export type Tick = "sending" | "failed" | "sent" | "delivered" | "read";

/** Read when every other member has read up to it; delivered when every device has it. */
export function tickFor(msg: Message, conv: Conversation | undefined, meId: string | undefined): Tick {
  if (msg.pending) return msg.pending;
  const others = conv?.members.filter((m) => m.id !== meId) ?? [];
  if (others.length === 0) return "sent";
  const at = Date.parse(msg.created_at);
  const reached = (t: string | null) => t !== null && Date.parse(t) >= at;
  if (others.every((m) => reached(m.last_read_at))) return "read";
  if (others.every((m) => reached(m.last_delivered_at) || reached(m.last_read_at))) return "delivered";
  return "sent";
}

export function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString();
}
