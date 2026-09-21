// Tiny WebSocket client for the API's realtime hub. Auto-reconnects with
// exponential backoff. Events are fanned out via a global EventTarget bus
// so any component can subscribe with realtimeBus.addEventListener(...) or
// the useRealtimeEvent hook.
import { getToken } from "./wails-bridge";

export interface RealtimeEvent<T = unknown> {
  type: string;
  payload: T;
}

// Resolve the ws:// URL from the same env the API client uses.
function resolveWsUrl(): string {
  const apiUrl =
    (import.meta.env.VITE_API_URL as string | undefined) ||
    (typeof window !== "undefined" && (window as any).go?.main?.App
      ? "http://localhost:8080/api"
      : "/api");
  if (apiUrl.startsWith("http://") || apiUrl.startsWith("https://")) {
    return apiUrl.replace(/^http/, "ws") + "/ws";
  }
  // Relative — resolve against window.location.
  const base =
    window.location.protocol === "https:"
      ? "wss://" + window.location.host
      : "ws://" + window.location.host;
  return base + apiUrl + "/ws";
}

// Global event bus — any component can listen for "chat.message.new",
// "notification.new", "system.connected", or your own resource events.
// The "*" event fires for every message, useful for debugging.
export const realtimeBus = new EventTarget();

class RealtimeClient {
  private ws: WebSocket | null = null;
  private retries = 0;
  private retryTimer: number | null = null;
  private stopped = true;

  // Call from your AuthProvider once the user has tokens. Idempotent.
  async start() {
    this.stopped = false;
    await this.connect();
  }

  // Call on logout to tear down the connection without auto-reconnecting.
  stop() {
    this.stopped = true;
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private async connect() {
    if (this.stopped) return;
    const token = await getToken("access_token");
    if (!token) {
      // Not logged in; try again in a bit.
      this.scheduleReconnect();
      return;
    }
    const url = resolveWsUrl() + "?token=" + encodeURIComponent(token);
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open", () => {
      this.retries = 0;
    });

    this.ws.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(ev.data) as RealtimeEvent;
        // Dispatch the typed event AND a "*" wildcard for debugging/logging.
        realtimeBus.dispatchEvent(
          new CustomEvent(data.type, { detail: data.payload })
        );
        realtimeBus.dispatchEvent(new CustomEvent("*", { detail: data }));
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.addEventListener("close", () => {
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.addEventListener("error", () => {
      // The close handler will fire next and trigger reconnect.
    });
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.retryTimer) return;
    // Exponential backoff: 1s, 2s, 4s, 8s, capped at 15s.
    const delay = Math.min(15_000, 1000 * Math.pow(2, this.retries));
    this.retries++;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }
}

// Singleton client. Start it from AuthProvider after tokens land,
// stop it on logout.
export const realtime = new RealtimeClient();
