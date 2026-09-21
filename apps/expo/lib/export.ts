import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "@/lib/secure-store";
import { API_URL } from "./api";

// Download the resource's CSV export and open the share sheet. `query` is an
// optional querystring (e.g. the current search) appended to /<plural>/export.
export async function exportResourceCsv(plural: string, query = ""): Promise<string> {
  const token = await SecureStore.getItemAsync("access_token");
  const url = API_URL + "/" + plural + "/export" + (query ? "?" + query : "");
  const fileUri = FileSystem.cacheDirectory + plural + "-export.csv";
  const res = await FileSystem.downloadAsync(url, fileUri, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error("Export failed (" + res.status + ")");
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(res.uri, { mimeType: "text/csv", dialogTitle: "Export " + plural });
  }
  return res.uri;
}
