import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@repo/shared/types";
import { localList, localGet, localCreate, localUpdate, localDelete } from "@/lib/sync-client";

// The offline store is generic over whatever it mirrors, so it hands back
// Record<string, unknown>. Asserting through unknown is what TypeScript wants
// for a widening cast between two types that do not overlap structurally, and
// it is honest: the rows really are unshaped until they get here.
//
// Casting once, here, is what lets the rest of the app see the same
// Message the API and every other client sees, and what makes grit sync
// reach this file: a locally declared type could not be updated.
export type { Message };

// What a create or an update may carry: the resource without the fields the
// server owns.
export type MessageInput = Partial<Omit<Message, "id" | "created_at" | "updated_at">>;

export function useMessages() {
  return useQuery<Message[]>({
    queryKey: ["messages"],
    queryFn: async () => (await localList("messages")) as unknown as Message[],
    // The background sync loop keeps the local mirror fresh; re-read it so the
    // list reflects server changes without a manual refresh.
    refetchInterval: 3000,
  });
}

export function useMessage(id: string) {
  return useQuery<Message | null>({
    queryKey: ["messages", id],
    queryFn: async () => (await localGet("messages", id)) as unknown as Message | null,
    enabled: !!id,
  });
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MessageInput) => localCreate("messages", "", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });
}

export function useUpdateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MessageInput }) =>
      localUpdate("messages", id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => localDelete("messages", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });
}
