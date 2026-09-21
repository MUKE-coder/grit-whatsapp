// The chat API, typed. One function per route in apps/api/internal/handlers/chat.go.
// The desktop client already carries the bearer token and shares one
// refresh between requests that fail together, so none of that is here.
import { apiClient as api } from "@/lib/api-client";

export interface ChatUser {
  id: string;
  first_name: string;
  last_name: string;
  avatar?: string;
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
  width?: number;
  height?: number;
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
  /** Client-side only: an optimistic message still on its way, or one that failed. */
  pending?: "sending" | "failed";
}

export interface Receipt {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
  last_delivered_at: string | null;
}

export interface Me {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar?: string;
}

interface Envelope<T> {
  data: T;
}

// ---- chat -------------------------------------------------------------------

export async function fetchUsers(search: string): Promise<ChatUser[]> {
  const res = await api.get<Envelope<ChatUser[]>>("/chat/users", { params: { search } });
  return res.data.data;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await api.get<Envelope<Conversation[]>>("/chat/conversations");
  return res.data.data;
}

export async function fetchConversation(id: string): Promise<Conversation> {
  const res = await api.get<Envelope<Conversation>>(`/chat/conversations/${id}`);
  return res.data.data;
}

export async function startDirect(userId: string): Promise<Conversation> {
  const res = await api.post<Envelope<Conversation>>("/chat/conversations/direct", { user_id: userId });
  return res.data.data;
}

export async function createGroup(title: string, memberIds: string[]): Promise<Conversation> {
  const res = await api.post<Envelope<Conversation>>("/chat/conversations/group", {
    title,
    member_ids: memberIds,
  });
  return res.data.data;
}

export const MESSAGE_PAGE = 40;

export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  const res = await api.get<Envelope<Message[]>>(`/chat/conversations/${conversationId}/messages`, {
    params: { limit: MESSAGE_PAGE, ...(before ? { before } : {}) },
  });
  return res.data.data;
}

export async function sendMessage(
  conversationId: string,
  input: { body: string; kind: MessageKind; attachment?: Attachment | null; client_id: string },
): Promise<Message> {
  const res = await api.post<Envelope<Message>>(`/chat/conversations/${conversationId}/messages`, input);
  return res.data.data;
}

export async function markRead(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/read`);
}

export async function markDelivered(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/delivered`);
}

export async function setMuted(conversationId: string, muted: boolean): Promise<void> {
  await api.put(`/chat/conversations/${conversationId}/mute`, { muted });
}

// ---- helpers -------------------------------------------------------------------

export function displayName(user: Pick<ChatUser, "first_name" | "last_name">): string {
  return `${user.first_name} ${user.last_name}`.trim();
}

/** A direct chat is named after the other person; a group after itself. */
export function conversationTitle(conv: Conversation, meId: string | undefined): string {
  if (conv.is_group) return conv.title;
  const other = conv.members.find((m) => m.id !== meId);
  return other ? displayName(other) : "Just you";
}

export function otherMember(conv: Conversation, meId: string | undefined): Member | undefined {
  return conv.is_group ? undefined : conv.members.find((m) => m.id !== meId);
}

export type Tick = "sending" | "failed" | "sent" | "delivered" | "read";

/**
 * The ticks on a message I sent: read when every other member has read up to
 * it, delivered when every other member's device has received it.
 */
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
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
