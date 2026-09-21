import { z } from "zod";

export const CreateConversationSchema = z.object({
  title: z.string().min(1, "Required"),
  is_group: z.boolean().optional(),
  last_message_at: z.string().nullable(),
  last_message_preview: z.string().min(1, "Required"),
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1, "Required").optional(),
  is_group: z.boolean().optional(),
  last_message_at: z.string().nullable(),
  last_message_preview: z.string().min(1, "Required").optional(),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;
