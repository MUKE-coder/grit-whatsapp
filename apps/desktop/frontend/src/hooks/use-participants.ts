import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Participant } from "@repo/shared/types";
import { localList, localGet, localCreate, localUpdate, localDelete } from "@/lib/sync-client";

// The offline store is generic over whatever it mirrors, so it hands back
// Record<string, unknown>. Asserting through unknown is what TypeScript wants
// for a widening cast between two types that do not overlap structurally, and
// it is honest: the rows really are unshaped until they get here.
//
// Casting once, here, is what lets the rest of the app see the same
// Participant the API and every other client sees, and what makes grit sync
// reach this file: a locally declared type could not be updated.
export type { Participant };

// What a create or an update may carry: the resource without the fields the
// server owns.
export type ParticipantInput = Partial<Omit<Participant, "id" | "created_at" | "updated_at">>;

export function useParticipants() {
  return useQuery<Participant[]>({
    queryKey: ["participants"],
    queryFn: async () => (await localList("participants")) as unknown as Participant[],
    // The background sync loop keeps the local mirror fresh; re-read it so the
    // list reflects server changes without a manual refresh.
    refetchInterval: 3000,
  });
}

export function useParticipant(id: string) {
  return useQuery<Participant | null>({
    queryKey: ["participants", id],
    queryFn: async () => (await localGet("participants", id)) as unknown as Participant | null,
    enabled: !!id,
  });
}

export function useCreateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ParticipantInput) => localCreate("participants", "", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["participants"] }),
  });
}

export function useUpdateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ParticipantInput }) =>
      localUpdate("participants", id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["participants"] }),
  });
}

export function useDeleteParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => localDelete("participants", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["participants"] }),
  });
}
