import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Blog {
  id: string;
  title: string;
  slug: string;
  content: string;
  image: string;
  excerpt: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlogsPage {
  data: Blog[];
  meta: { total: number; page: number; page_size: number; pages: number };
}

// Admin blog list — the seeded admin account can browse every post (drafts
// included). Public published posts are also available at GET /blogs.
export function useBlogs(search = "") {
  return useInfiniteQuery({
    queryKey: ["blogs", { search }],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ page: String(pageParam), page_size: "20" });
      if (search) qs.set("search", search);
      return (await api.get("/admin/blogs?" + qs.toString())) as BlogsPage;
    },
    getNextPageParam: (last) =>
      last.meta && last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined,
  });
}

export function useCreateBlog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => api.post("/admin/blogs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}
