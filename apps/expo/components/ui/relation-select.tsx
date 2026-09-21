import { useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface RelationOption {
  id: string;
  [key: string]: any;
}

interface RelationSelectProps {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: RelationOption[];
  placeholder?: string;
}

function optionLabel(o: RelationOption): string {
  return String(o.name ?? o.title ?? o.label ?? o.id);
}

export function RelationSelect({ label, value, onChange, options, placeholder }: RelationSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const insets = useSafeAreaInsets();

  const selected = options.find((o) => o.id === value);
  const q = search.trim().toLowerCase();
  const filtered = q ? options.filter((o) => optionLabel(o).toLowerCase().includes(q)) : options;

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <View className="mb-4">
      <Text className="text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-3.5 flex-row items-center justify-between"
      >
        <Text
          className={selected ? "text-[15px] text-[#0F1018] dark:text-white" : "text-[15px] text-[#9CA3AF]"}
          numberOfLines={1}
        >
          {selected ? optionLabel(selected) : placeholder || "Select " + label}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable className="flex-1 bg-black/40" onPress={close} />
        <View
          className="bg-[#F4F4F6] dark:bg-[#0a0a0f] rounded-t-3xl"
          style={{ maxHeight: "72%", paddingBottom: insets.bottom + 12 }}
        >
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-[#D1D5DB] dark:bg-[#2a2a3a]" />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-3">
            <Text className="text-[17px] font-bold text-[#0F1018] dark:text-white">Select {label}</Text>
            <Pressable onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color="#9CA3AF" />
            </Pressable>
          </View>
          <View className="px-5 pb-2">
            <View
              className="bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl flex-row items-center px-4"
              style={{ height: 46 }}
            >
              <Ionicons name="search-outline" size={18} color="#9CA3AF" />
              <TextInput
                className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
                placeholder={"Search " + label + "…"}
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoFocus
              />
            </View>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(o) => String(o.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
            renderItem={({ item }) => {
              const isSel = item.id === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.id);
                    close();
                  }}
                  className="flex-row items-center justify-between px-4 py-3.5 mb-2 rounded-2xl bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b]"
                >
                  <Text className="text-[15px] text-[#0F1018] dark:text-white flex-1" numberOfLines={1}>
                    {optionLabel(item)}
                  </Text>
                  {isSel ? <Ionicons name="checkmark-circle" size={20} color="#6c5ce7" /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text className="text-center text-[#9CA3AF] mt-8">No matches</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}
