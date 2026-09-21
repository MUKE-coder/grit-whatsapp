import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface MyPermissions {
  grants: string[];
  permissions: string[];
  is_super: boolean;
}

export function usePermissions() {
  const { data, isLoading } = useQuery<MyPermissions>({
    queryKey: ["my-permissions"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      // api.get resolves to the parsed body ({data, meta}), not an
      // axios-style {data: body} — one .data, not two.
      const res = await api.get("/auth/permissions");
      return res.data as MyPermissions;
    },
  });

  const granted = new Set(data?.permissions ?? []);
  const isSuper = data?.is_super ?? false;

  /**
   * can("users.view")  — exact permission
   * can("users.*")     — any permission on that resource
   *
   * Returns false while loading, so admin-only UI stays hidden rather than
   * flashing in and disappearing.
   */
  function can(permission: string): boolean {
    if (isSuper) return true;
    if (permission.endsWith(".*")) {
      const prefix = permission.slice(0, -1);
      for (const p of granted) {
        if (p.startsWith(prefix)) return true;
      }
      return false;
    }
    return granted.has(permission);
  }

  return { can, isSuper, isLoading, permissions: data?.permissions ?? [] };
}
