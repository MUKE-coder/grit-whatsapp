import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const isWeb = Platform.OS === "web";

// localStorage is absent during static rendering and in a private-mode Safari
// that has refused it, so every access is guarded rather than assumed.
function webStore(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (!isWeb) return SecureStore.getItemAsync(key);
  return webStore()?.getItem(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (!isWeb) return SecureStore.setItemAsync(key, value);
  webStore()?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (!isWeb) return SecureStore.deleteItemAsync(key);
  webStore()?.removeItem(key);
}
