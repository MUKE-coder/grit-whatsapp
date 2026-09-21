export interface Conversation {
  id: string;
  title: string;
  is_group: boolean;
  last_message_at: string | null;
  last_message_preview: string;
  created_at: string;
  updated_at: string;
}
