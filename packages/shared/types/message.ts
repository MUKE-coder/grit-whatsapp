import type { Conversation } from "./conversation";
import type { User } from "./user";
import type { FileRef } from "../schemas/file-ref";

export interface Message {
  id: string;
  conversation_id: string;
  conversation?: Conversation;
  sender_id: string;
  sender?: User;
  body: string;
  kind: "text" | "image" | "file";
  attachment: FileRef | null;
  created_at: string;
  updated_at: string;
}
