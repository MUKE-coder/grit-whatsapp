import { z } from "zod";
import { FileRefSchema } from "./file-ref";

export const CreateMessageSchema = z.object({
  conversation_id: z.string().uuid("Invalid ID"),
  sender_id: z.string().uuid("Invalid ID"),
  body: z.string().optional(),
  kind: z.enum(["text", "image", "file"]),
  attachment: FileRefSchema.nullable(),
});

export const UpdateMessageSchema = z.object({
  conversation_id: z.string().uuid("Invalid ID").optional(),
  sender_id: z.string().uuid("Invalid ID").optional(),
  body: z.string().optional(),
  kind: z.enum(["text", "image", "file"]).optional(),
  attachment: FileRefSchema.nullable(),
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;
export type UpdateMessageInput = z.infer<typeof UpdateMessageSchema>;
