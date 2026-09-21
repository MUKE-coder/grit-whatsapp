import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Conversation } from "@repo/shared/types";
import { localList, localGet, localCreate, localUpdate, localDelete } from "@/lib/sync-client";

// The offline store is generic over whatever it mirrors, so it hands back
// Record<string, unknown>. Asserting through unknown is what TypeScript wants
// for a widening cast between two types that do not overlap structurally, and
// it is honest: the rows really are unshaped until they get here.
//
// Casting once, here, is what lets the rest of the app see the same
// Conversation the API and every other client sees, and what makes grit sync
// reach this file: a locally declared type could not be updated.
export type { Conversation };

// What a create or an update may carry: the resource without the fields the
// server owns.
export type ConversationInput = Partial<Omit<Conversation, "id" | "created_at" | "updated_at">>;

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => (await localList("conversations")) as unknown as Conversation[],
    // The background sync loop keeps the local mirror fresh; re-read it so the
    // list reflects server changes without a manual refresh.
    refetchInterval: 3000,
  });
}

export function useConversation(id: string) {
  return useQuery<Conversation | null>({
    queryKey: ["conversations", id],
    queryFn: async () => (await localGet("conversations", id)) as unknown as Conversation | null,
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ConversationInput) => localCreate("conversations", "", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useUpdateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConversationInput }) =>
      localUpdate("conversations", id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => localDelete("conversations", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}
