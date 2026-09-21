import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "@/lib/secure-store";
import * as Sharing from "expo-sharing";
import { API_URL } from "./api";

export interface CsvPreview {
  headers: string[];
  rows: string[][];
  total: number;
}

// Download a ready-to-fill CSV template for the resource and open the share
// sheet so the user can fill it in and re-import.
export async function downloadResourceTemplate(plural: string): Promise<string> {
  const token = await SecureStore.getItemAsync("access_token");
  const url = API_URL + "/" + plural + "/import/template";
  const fileUri = FileSystem.cacheDirectory + plural + "-template.csv";
  const res = await FileSystem.downloadAsync(url, fileUri, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error("Template download failed (" + res.status + ")");
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(res.uri, { mimeType: "text/csv", dialogTitle: plural + " template" });
  }
  return res.uri;
}

// Read + naively parse a CSV for a preview (first `limit` data rows).
export async function parseCsvPreview(fileUri: string, limit = 8): Promise<CsvPreview> {
  const text = await FileSystem.readAsStringAsync(fileUri);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parseLine = (l: string) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const headers = lines.length ? parseLine(lines[0]) : [];
  const dataLines = lines.slice(1);
  return { headers, rows: dataLines.slice(0, limit).map(parseLine), total: dataLines.length };
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
}

export interface ImportJobStatus extends ImportResult {
  id: string;
  status: "processing" | "completed" | "failed";
  total: number;
  processed: number;
  message: string;
}

// Upload the CSV to /<plural>/import. The server processes it in the BACKGROUND
// and responds 202 with a job id, so a large file never blocks the request.
// We then poll /imports/:id until it finishes, reporting progress (0..1) so the
// caller can drive a progress bar. Because the polling loop lives here (and is
// kicked off from a module-level store), it keeps running even if the screen
// that started it unmounts.
export async function importResourceCsv(
  plural: string,
  fileUri: string,
  onProgress?: (fraction: number) => void,
): Promise<ImportResult> {
  const token = await SecureStore.getItemAsync("access_token");
  const res = await FileSystem.uploadAsync(API_URL + "/" + plural + "/import", fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: "text/csv",
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (!res || res.status < 200 || res.status >= 300) {
    const body = res?.body ? JSON.parse(res.body) : null;
    throw new Error(body?.error?.message || "Import failed (" + (res?.status ?? "?") + ")");
  }
  const started = JSON.parse(res.body).data as { job_id: string; total: number };
  if (onProgress && started.total === 0) onProgress(1);
  return pollImportJob(started.job_id, onProgress);
}

// Poll a background import until it reaches a terminal state, reporting
// processed/total progress on the way. Resolves with the final counts + errors.
export async function pollImportJob(
  jobId: string,
  onProgress?: (fraction: number) => void,
): Promise<ImportResult> {
  const token = await SecureStore.getItemAsync("access_token");
  const url = API_URL + "/imports/" + jobId;
  for (;;) {
    const res = await fetch(url, {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (!res.ok) throw new Error("Could not check import status (" + res.status + ")");
    const job = (await res.json()).data as ImportJobStatus;
    if (onProgress && job.total > 0) onProgress(job.processed / job.total);
    if (job.status === "completed" || job.status === "failed") {
      return {
        created: job.created,
        skipped: job.skipped,
        failed: job.failed,
        errors: job.errors || [],
      };
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}
