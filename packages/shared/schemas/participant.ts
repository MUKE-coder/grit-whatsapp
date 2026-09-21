import { z } from "zod";

export const CreateParticipantSchema = z.object({
  conversation_id: z.string().uuid("Invalid ID"),
  user_id: z.string().uuid("Invalid ID"),
  role: z.enum(["member", "admin"]),
  last_read_at: z.string().nullable(),
  last_delivered_at: z.string().nullable(),
  muted: z.boolean().optional(),
});

export const UpdateParticipantSchema = z.object({
  conversation_id: z.string().uuid("Invalid ID").optional(),
  user_id: z.string().uuid("Invalid ID").optional(),
  role: z.enum(["member", "admin"]).optional(),
  last_read_at: z.string().nullable(),
  last_delivered_at: z.string().nullable(),
  muted: z.boolean().optional(),
});

export type CreateParticipantInput = z.infer<typeof CreateParticipantSchema>;
export type UpdateParticipantInput = z.infer<typeof UpdateParticipantSchema>;
