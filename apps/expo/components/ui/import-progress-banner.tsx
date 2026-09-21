import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useImports, dismissImport, type ImportProgress } from "@/lib/import-progress";

export function ImportProgressBanner() {
  const jobs = useImports();
  const insets = useSafeAreaInsets();
  if (!jobs.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 84 }}
    >
      {jobs.map((j) => (
        <BannerRow key={j.id} job={j} />
      ))}
    </View>
  );
}

function BannerRow({ job }: { job: ImportProgress }) {
  const done = job.status === "completed";
  const failed = job.status === "failed";
  const icon = failed ? "alert-circle" : done ? "checkmark-circle" : "cloud-upload-outline";
  const tint = failed ? "#ff6b6b" : done ? "#00b894" : "#6c5ce7";
  return (
    <View className="bg-white dark:bg-[#1a1a24] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-3 mb-2 shadow-lg">
      <View className="flex-row items-center">
        <Ionicons name={icon as any} size={18} color={tint} />
        <Text className="flex-1 text-[13px] font-semibold text-[#0F1018] dark:text-white ml-2" numberOfLines={1}>
          {failed
            ? "Import failed"
            : done
              ? "Import complete — " + (job.result?.created ?? 0) + " added"
              : "Importing " + job.label}
        </Text>
        {done || failed ? (
          <Pressable onPress={() => dismissImport(job.id)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#9CA3AF" />
          </Pressable>
        ) : (
          <Text className="text-[12px] text-[#6B7280] dark:text-[#9090a8]">{Math.round(job.fraction * 100)}%</Text>
        )}
      </View>
      {!done && !failed ? (
        <View className="w-full h-1.5 rounded-full bg-[#E5E7EB] dark:bg-[#2a2a3a] overflow-hidden mt-2">
          <View style={{ width: `${Math.round(job.fraction * 100)}%` as const }} className="h-1.5 bg-[#6c5ce7]" />
        </View>
      ) : null}
      {failed && job.error ? (
        <Text className="text-[12px] text-[#ff6b6b] mt-1" numberOfLines={2}>{job.error}</Text>
      ) : null}
      {done && job.result ? (
        <Text className="text-[12px] text-[#6B7280] dark:text-[#9090a8] mt-1">
          {job.result.created} created · {job.result.skipped} skipped · {job.result.failed} failed
        </Text>
      ) : null}
    </View>
  );
}
