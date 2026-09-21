import { useSyncExternalStore } from "react";
import { importResourceCsv, type ImportResult } from "./import";

export interface ImportProgress {
  id: string;
  plural: string;
  label: string;
  status: "processing" | "completed" | "failed";
  fraction: number;
  result?: ImportResult;
  error?: string;
}

let jobs: ImportProgress[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  listeners.forEach((l) => l());
}
function patch(id: string, p: Partial<ImportProgress>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
  emit();
}

export function subscribeImports(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function getImports() {
  return jobs;
}
export function dismissImport(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

// Kick off a background import. Uploading + polling continue independently of
// any screen, so the user can close the sheet and navigate away. Returns the
// local job id so a still-open sheet can render its own progress/summary.
export function startImport(
  plural: string,
  fileUri: string,
  label: string,
  onDone?: () => void,
): string {
  const id = "imp-" + counter++;
  jobs = [...jobs, { id, plural, label, status: "processing", fraction: 0 }];
  emit();
  (async () => {
    try {
      const result = await importResourceCsv(plural, fileUri, (f) => patch(id, { fraction: f }));
      patch(id, { status: "completed", fraction: 1, result });
      onDone?.();
    } catch (e: any) {
      patch(id, { status: "failed", error: e?.message || "Import failed" });
    }
  })();
  return id;
}

// useImports subscribes a component to the live list of background imports.
export function useImports(): ImportProgress[] {
  return useSyncExternalStore(subscribeImports, getImports, getImports);
}
