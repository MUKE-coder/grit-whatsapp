import Constants from "expo-constants";

// The dev host the app already uses to reach Metro / the API. A device or
// emulator can't reach "localhost"/"127.0.0.1" — those point at the device
// itself — so we reuse this host to rewrite storage URLs below.
function devHost(): string | undefined {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.expoGoConfig as any)?.debuggerHost ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;
  const host = hostUri ? String(hostUri).split(":")[0] : undefined;
  return host && host !== "localhost" && host !== "127.0.0.1" ? host : undefined;
}

// resolveImageUrl makes a stored file URL loadable on a real device/emulator.
// Dev storage returns http://localhost:<port>/... which only resolves on the
// server machine; we rewrite the host to the dev host the app talks to for the
// API, keeping the storage port. Production public URLs pass through unchanged.
export function resolveImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const host = devHost();
  if (host) {
    return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${host}`);
  }
  return url;
}
