import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { FormSheet } from "./form-sheet";
import { parseCsvPreview, downloadResourceTemplate, type CsvPreview } from "@/lib/import";
import { startImport, useImports } from "@/lib/import-progress";

interface ImportSheetProps {
  plural: string;
  visible: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function ImportSheet({ plural, visible, onClose, onImported }: ImportSheetProps) {
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // The import runs in a module-level store, so it keeps going after this sheet
  // closes — we just read its live state back to show progress while open.
  const jobs = useImports();
  const job = jobs.find((j) => j.id === activeId) || null;

  const reset = () => {
    setFileUri(null);
    setFileName("");
    setPreview(null);
    setActiveId(null);
    setError("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const pick = async () => {
    setError("");
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/csv", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setFileUri(asset.uri);
    setFileName(asset.name);
    setActiveId(null);
    try {
      setPreview(await parseCsvPreview(asset.uri));
    } catch (e: any) {
      setError(e.message || "Could not read the file");
    }
  };

  const runImport = () => {
    if (!fileUri) return;
    setError("");
    // Hand off to the background store; the sheet can be closed immediately and
    // the persistent banner will keep showing progress + the result.
    setActiveId(startImport(plural, fileUri, fileName || plural, onImported));
  };

  const onTemplate = async () => {
    setError("");
    try {
      await downloadResourceTemplate(plural);
    } catch (e: any) {
      setError(e.message || "Could not download template");
    }
  };

  const cw = 130;
  const labelClass = "text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8]";
  const displayError = error || (job?.status === "failed" ? job.error || "Import failed" : "");

  return (
    <FormSheet visible={visible} onClose={close} title="Import CSV">
      {displayError ? (
        <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
          <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
          <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{displayError}</Text>
        </View>
      ) : null}

      {job?.status === "completed" && job.result ? (
        <View>
          <View className="items-center mb-5">
            <Ionicons name="checkmark-circle" size={44} color="#00b894" />
            <Text className="text-[17px] font-bold text-[#0F1018] dark:text-white mt-2">Import complete</Text>
          </View>
          <SummaryRow label="Created" value={job.result.created} color="#00b894" />
          <SummaryRow label="Skipped (duplicates)" value={job.result.skipped} color="#fdcb6e" />
          <SummaryRow label="Failed" value={job.result.failed} color="#ff6b6b" />
          {job.result.errors.length > 0 ? (
            <View className="mt-3">
              <Text className={labelClass + " mb-2"}>Errors</Text>
              {job.result.errors.slice(0, 20).map((e, idx) => (
                <Text key={idx} className="text-[12px] text-[#6B7280] dark:text-[#9090a8] mb-1">
                  Row {e.row}: {e.message}
                </Text>
              ))}
            </View>
          ) : null}
          <Pressable onPress={close} className="bg-[#6c5ce7] rounded-full py-4 items-center mt-5">
            <Text className="text-white font-semibold text-[15px]">Done</Text>
          </Pressable>
        </View>
      ) : job?.status === "processing" ? (
        <View className="py-8 items-center">
          <Text className="text-[15px] text-[#0F1018] dark:text-white mb-4">Importing {fileName}…</Text>
          <View className="w-full h-2.5 rounded-full bg-[#E5E7EB] dark:bg-[#2a2a3a] overflow-hidden">
            <View style={{ width: `${Math.round(job.fraction * 100)}%` as const }} className="h-2.5 bg-[#6c5ce7]" />
          </View>
          <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] mt-2">{Math.round(job.fraction * 100)}%</Text>
          <Pressable onPress={close} className="rounded-full py-3 px-8 items-center mt-4">
            <Text className="text-[#6c5ce7] font-semibold text-[14px]">Continue in background</Text>
          </Pressable>
        </View>
      ) : preview ? (
        <View>
          <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white mb-1">{fileName}</Text>
          <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] mb-3">{preview.total} rows to import</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator className="mb-2" style={{ maxHeight: 260 }}>
            <View>
              <View className="flex-row border-b-2 border-[#E5E7EB] dark:border-[#2a2a3a]">
                {preview.headers.map((h, i) => (
                  <View key={i} style={{ width: cw }} className="px-2 py-2">
                    <Text className={labelClass} numberOfLines={1}>{h}</Text>
                  </View>
                ))}
              </View>
              {preview.rows.map((r, ri) => (
                <View key={ri} className="flex-row border-b border-[#E5E7EB] dark:border-[#1f1f2b]">
                  {preview.headers.map((_, ci) => (
                    <View key={ci} style={{ width: cw }} className="px-2 py-2">
                      <Text className="text-[13px] text-[#0F1018] dark:text-white" numberOfLines={1}>{r[ci] ?? ""}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          {preview.total > preview.rows.length ? (
            <Text className="text-[12px] text-[#9CA3AF] dark:text-[#606078] mb-3">
              +{preview.total - preview.rows.length} more rows
            </Text>
          ) : null}
          <Pressable onPress={runImport} className="bg-[#6c5ce7] rounded-full py-4 items-center">
            <Text className="text-white font-semibold text-[15px]">Import {preview.total} rows</Text>
          </Pressable>
          <Pressable onPress={pick} className="rounded-full py-3 items-center mt-2">
            <Text className="text-[#6c5ce7] font-semibold text-[14px]">Choose a different file</Text>
          </Pressable>
        </View>
      ) : (
        <View className="py-8 items-center">
          <Ionicons name="document-attach-outline" size={44} color="#9CA3AF" />
          <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white mt-3">Import from CSV</Text>
          <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] text-center mt-1 px-6">
            The first row should be column headers that match the field names.
          </Text>
          <Pressable onPress={pick} className="bg-[#6c5ce7] rounded-full py-4 px-8 items-center mt-5">
            <Text className="text-white font-semibold text-[15px]">Choose CSV file</Text>
          </Pressable>
          <Pressable onPress={onTemplate} className="rounded-full py-3 px-8 items-center mt-2 flex-row">
            <Ionicons name="download-outline" size={16} color="#6c5ce7" />
            <Text className="text-[#6c5ce7] font-semibold text-[14px] ml-2">Download template</Text>
          </Pressable>
        </View>
      )}
    </FormSheet>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-[#E5E7EB] dark:border-[#1f1f2b]">
      <Text className="text-[14px] text-[#6B7280] dark:text-[#9090a8]">{label}</Text>
      <Text style={{ color }} className="text-[16px] font-bold">{value}</Text>
    </View>
  );
}
