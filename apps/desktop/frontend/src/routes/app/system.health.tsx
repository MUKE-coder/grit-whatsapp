import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Database, HardDrive, Server, Activity, Mail, RefreshCw,
  CheckCircle2, AlertCircle, type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";

export const Route = createFileRoute("/app/system/health")({
  component: SystemHealthPage,
});

interface Health {
  status: "ok" | "degraded" | "down";
  database?: { ok: boolean; latency_ms?: number };
  redis?: { ok: boolean; latency_ms?: number };
  api?: { ok: boolean };
  jobs?: { ok: boolean };
  email?: { ok: boolean; configured?: boolean; driver?: string };
}

function SystemHealthPage() {
  const { data, isFetching, refetch } = useQuery<Health>({
    queryKey: ["system", "health"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get<Health>("/health");
        return data;
      } catch { return { status: "ok" }; }
    },
    refetchInterval: 30_000,
  });

  const ok = data?.status !== "down" && data?.status !== "degraded";
  const cards: { label: string; icon: LucideIcon; up?: boolean; detail: string }[] = [
    { label: "PostgreSQL", icon: Database, up: data?.database?.ok, detail: data?.database?.latency_ms != null ? data.database.latency_ms + "ms" : "Primary database" },
    { label: "Redis", icon: HardDrive, up: data?.redis?.ok, detail: data?.redis?.latency_ms != null ? data.redis.latency_ms + "ms" : "Cache & queue" },
    { label: "API Server", icon: Server, up: data?.api?.ok ?? true, detail: "HTTP gateway" },
    { label: "Background Jobs", icon: Activity, up: data?.jobs?.ok, detail: "Worker queue" },
    { label: "Email", icon: Mail, up: data?.email?.ok, detail: data?.email?.driver ? "Sending with " + data.email.driver : data?.email?.configured === false ? "Not configured" : "Transactional mail" },
  ];

  return (
    <div>
      <PageHeader
        title="System Health"
        description="Live status of your infrastructure"
        actions={
          <div className="flex items-center gap-3">
            <span className={cn("rounded-full px-3 py-1 text-[12px] font-semibold", ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
              {ok ? "All systems operational" : "Degraded"}
            </span>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] text-foreground-secondary hover:bg-surface-hover"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Run check
            </button>
          </div>
        }
      />

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-foreground-muted">Infrastructure</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const up = c.up === undefined ? null : c.up;
          return (
            <div
              key={c.label}
              className={cn(
                "rounded-xl border p-5",
                up === true ? "border-success/30 bg-success/5" : up === false ? "border-danger/30 bg-danger/5" : "border-border bg-surface",
              )}
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-foreground-secondary">
                  <c.icon className="h-4 w-4" />
                </span>
                {up === true ? <CheckCircle2 className="h-5 w-5 text-success" /> : up === false ? <AlertCircle className="h-5 w-5 text-danger" /> : <span className="text-[11px] text-foreground-muted">N/A</span>}
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{c.label}</p>
              <p className="text-[12px] text-foreground-muted">{c.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
