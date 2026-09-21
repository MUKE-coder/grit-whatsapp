import * as SecureStore from "@/lib/secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Resolve the API base URL so it works on a simulator AND a physical
// device without hand-editing IPs:
//   1. EXPO_PUBLIC_API_URL wins if set (e.g. a deployed backend).
//   2. Otherwise derive the dev machine's LAN IP from the host the phone
//      already used to reach Metro (Constants ... hostUri). A real device
//      can't reach "localhost"/"10.0.2.2" — those point at the device
//      itself — but it CAN reach whatever IP Metro is served on.
//   3. Fall back to the platform loopback for web / edge cases.
const API_PORT = 8080;

function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "") + "/api";

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.expoGoConfig as any)?.debuggerHost ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;
  const host = hostUri ? String(hostUri).split(":")[0] : undefined;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return "http://" + host + ":" + API_PORT + "/api";
  }

  return Platform.select({
    android: "http://10.0.2.2:" + API_PORT + "/api",
    default: "http://localhost:" + API_PORT + "/api",
  }) as string;
}

// The API is served under a version prefix. resolveApiUrl() returns the root
// ending in "/api", so the version is appended once here and every call site
// (which builds URLs as API_URL + "/users") follows automatically. Bump this
// to move the whole app to a new API version.
export const API_VERSION = "v1";

const API_URL = resolveApiUrl().replace(/\/+$/, "") + "/" + API_VERSION;

// Fail fast instead of letting fetch hang for minutes when the API is
// unreachable — that hang is what leaves the splash screen stuck.
const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export { API_URL };

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

// UUIDv4-shaped string for the Idempotency-Key header. Math.random is fine
// here — collision risk for per-mutation keys with 122 bits of entropy is
// effectively zero, and we don't need cryptographic strength for dedupe.
function randomKey(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class ApiClient {
  private async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync("access_token");
  }

  // Public: lets the auth provider skip the /auth/me boot request entirely
  // when there's no session — no token means no network call, so a fresh
  // install dismisses the splash instantly instead of waiting on a fetch.
  async hasToken(): Promise<boolean> {
    return !!(await SecureStore.getItemAsync("access_token"));
  }

  private async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync("refresh_token");
  }

  async setTokens(accessToken?: string, refreshToken?: string) {
    // Guard against a shape mismatch: SecureStore throws an opaque
    // "Values must be strings" error on undefined, so surface a clear one.
    if (!accessToken || !refreshToken) {
      throw new Error("Auth response did not include tokens");
    }
    await SecureStore.setItemAsync("access_token", accessToken);
    await SecureStore.setItemAsync("refresh_token", refreshToken);
  }

  async clearTokens() {
    await SecureStore.deleteItemAsync("access_token");
    await SecureStore.deleteItemAsync("refresh_token");
  }

  private async request(endpoint: string, options: RequestOptions = {}) {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Stable idempotency key for unsafe methods so the 401-refresh retry
    // below replays the exact same request and the server can dedupe.
    const method = options.method || "GET";
    const unsafe = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    if (unsafe && !headers["Idempotency-Key"]) {
      headers["Idempotency-Key"] = randomKey();
    }

    let res = await fetchWithTimeout(`${API_URL}${endpoint}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Skip refresh on the auth endpoints themselves — a wrong password
    // 401-ing into a refresh attempt would loop and wipe the session.
    const isAuthEndpoint =
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/register") ||
      endpoint.includes("/auth/refresh");

    // Try refresh if unauthorized
    if (res.status === 401 && !isAuthEndpoint) {
      const refreshToken = await this.getRefreshToken();
      if (refreshToken) {
        const refreshRes = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          await this.setTokens(data.data.tokens.access_token, data.data.tokens.refresh_token);

          headers["Authorization"] = `Bearer ${data.data.tokens.access_token}`;
          res = await fetchWithTimeout(`${API_URL}${endpoint}`, {
            method: options.method || "GET",
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
          });
        } else {
          await this.clearTokens();
          throw new Error("Session expired");
        }
      }
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message || "Request failed");
    }
    return json;
  }

  get(endpoint: string) {
    return this.request(endpoint, { method: "GET" });
  }

  post(endpoint: string, body: any) {
    return this.request(endpoint, { method: "POST", body });
  }

  put(endpoint: string, body: any) {
    return this.request(endpoint, { method: "PUT", body });
  }

  delete(endpoint: string) {
    return this.request(endpoint, { method: "DELETE" });
  }
}

export const api = new ApiClient();
