import { useEffect } from "react";
import { realtimeBus, type RealtimeEvent } from "@/lib/realtime";

// useRealtimeEvent subscribes a callback to a single realtime event type.
// The callback is wrapped so it always sees the latest closure (no stale
// state), and unsubscribed on unmount.
//
// Usage:
//   useRealtimeEvent<ChatMessage>("chat.message.new", (msg) => {
//     queryClient.invalidateQueries({ queryKey: ["chats"] });
//   });
export function useRealtimeEvent<T = unknown>(
  type: string,
  callback: (payload: T) => void,
) {
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<T>;
      callback(ce.detail);
    };
    realtimeBus.addEventListener(type, handler);
    return () => realtimeBus.removeEventListener(type, handler);
  }, [type, callback]);
}

// useRealtimeAny fires for EVERY message — useful for an in-app toast bar
// or a debug console. Receives the full envelope, not just the payload.
export function useRealtimeAny(callback: (event: RealtimeEvent) => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<RealtimeEvent>;
      callback(ce.detail);
    };
    realtimeBus.addEventListener("*", handler);
    return () => realtimeBus.removeEventListener("*", handler);
  }, [callback]);
}
