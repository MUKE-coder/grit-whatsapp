import type { Conversation } from "./conversation";
import type { User } from "./user";

export interface Participant {
  id: string;
  conversation_id: string;
  conversation?: Conversation;
  user_id: string;
  user?: User;
  role: "member" | "admin";
  last_read_at: string | null;
  last_delivered_at: string | null;
  muted: boolean;
  created_at: string;
  updated_at: string;
}
