import { useQuery } from "@tanstack/react-query";
import type { User } from "@repo/shared/types";
import { apiClient } from "@/lib/api-client";

export type { User };

// Users for a relationship picker. Not in the offline mirror, so read from the
// API: while offline the picker is empty and the form keeps what it had.
export function useUsers() {
  return useQuery<User[]>({
    queryKey: ["users", "options"],
    queryFn: async () => (await apiClient.get("/users?page_size=500")).data.data ?? [],
    staleTime: 60_000,
  });
}
