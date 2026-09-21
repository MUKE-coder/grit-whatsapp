"use client";

import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import type { Tick } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

const palette = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600"];

/** Initials on a colour picked from the id, so a person keeps their colour everywhere. */
export function Avatar({
  id,
  name,
  src,
  size = "md",
  online = false,
}: {
  id: string;
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const dims = { sm: "h-8 w-8 text-xs", md: "h-11 w-11 text-sm", lg: "h-14 w-14 text-base" }[size];
  return (
    <span className={cn("relative inline-flex shrink-0", dims)}>
      {src ? (
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full font-semibold text-white",
            palette[hash % palette.length],
          )}
        >
          {initials}
        </span>
      )}
      {online && (
        <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-background bg-success">
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}

const tickLabel: Record<Tick, string> = {
  sending: "Sending",
  failed: "Not sent",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

/**
 * One tick sent, two delivered, two highlighted read. onAccent is for ticks on
 * an accent-coloured bubble, where the usual blue would not show.
 */
export function Ticks({ tick, onAccent = false }: { tick: Tick; onAccent?: boolean }) {
  const label = tickLabel[tick];
  const cls = "h-4 w-4";
  const dim = onAccent ? "text-white/60" : "text-text-muted";
  const read = onAccent ? "text-cyan-200" : "text-info";
  return (
    <span title={label} className="inline-flex">
      <span className="sr-only">{label}</span>
      {tick === "sending" && <Clock aria-hidden className={cn(cls, dim)} />}
      {tick === "failed" && <AlertCircle aria-hidden className={cn(cls, onAccent ? "text-white" : "text-danger")} />}
      {tick === "sent" && <Check aria-hidden className={cn(cls, dim)} />}
      {tick === "delivered" && <CheckCheck aria-hidden className={cn(cls, dim)} />}
      {tick === "read" && <CheckCheck aria-hidden className={cn(cls, read)} />}
    </span>
  );
}

/** "14:05" today, "Yesterday", a weekday this week, else a date. */
export function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString();
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "Today", "Yesterday" or a date, for the separators between days. */
export function dayLabel(iso: string): string {
  const days = Math.floor((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
