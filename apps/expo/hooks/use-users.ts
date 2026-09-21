import { useInfiniteQuery } from "@tanstack/react-query";
import type { User } from "@repo/shared/types";
import { api } from "@/lib/api";

export type { User };

export interface UsersPage {
  data: User[];
  meta: { total: number; page: number; page_size: number; pages: number };
}

// Users for a relationship picker or filter, with the same arguments as a
// generated resource's list hook.
export function useUsers(
  search = "",
  filters: Record<string, string> = {},
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc",
  pageSize = 20,
) {
  return useInfiniteQuery({
    queryKey: ["users", { search, filters, sortBy, sortOrder, pageSize }],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({
        page: String(pageParam),
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (search) qs.set("search", search);
      for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
      return (await api.get("/users?" + qs.toString())) as UsersPage;
    },
    getNextPageParam: (last) =>
      last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined,
  });
}
