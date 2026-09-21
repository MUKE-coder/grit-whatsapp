import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "@/lib/secure-store";
import { API_URL } from "./api";

// Pick an image and upload it to POST /uploads (multipart). Returns the public
// URL of the stored file, or null if the user cancelled.
export async function pickAndUploadImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Photo library permission is required");

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;

  return uploadLocalFile(result.assets[0].uri, result.assets[0].fileName, result.assets[0].mimeType);
}

// uploadLocalFile POSTs a local file:// URI to /uploads as multipart/form-data.
//
// It uses fetch + FormData with a React Native file descriptor ({ uri, name,
// type }). Two rules make this reliable on Expo SDK 54 / New Architecture:
//   1. NEVER set a Content-Type header — fetch derives "multipart/form-data"
//      WITH the boundary from the FormData. Setting it by hand drops the
//      boundary and the server can't find the file part ("No file provided").
//   2. Give the descriptor a real name + type so the server's MIME allowlist
//      accepts it.
// This replaces expo-file-system's uploadAsync, which sends an EMPTY body under
// the New Architecture on SDK 54 (the request lands in a few ms with no file).
export async function uploadLocalFile(
  uri: string,
  fileName?: string | null,
  mimeType?: string | null,
): Promise<string> {
  const name = fileName || uri.split("/").pop() || "photo.jpg";
  const ext = (name.split(".").pop() || "jpg").toLowerCase();
  const extToMime: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
  };
  const type = mimeType || extToMime[ext] || "image/jpeg";

  const token = await SecureStore.getItemAsync("access_token");

  const formData = new FormData();
  // RN's FormData accepts a { uri, name, type } file descriptor — the cast is
  // needed because the DOM FormData types don't model it.
  formData.append("file", { uri, name, type } as any);

  const res = await fetch(API_URL + "/uploads", {
    method: "POST",
    headers: token ? { Authorization: "Bearer " + token } : undefined,
    body: formData,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // Surface the server's reason (e.g. "File type not allowed") instead of a
    // generic failure, so upload problems are diagnosable from the UI.
    throw new Error(json?.error?.message || "Upload failed (" + res.status + ")");
  }
  return json?.data?.url ?? null;
}
