import type { ReactNode } from "react";
import { Modal, View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface FormSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Bottom sheet for quick create/edit. Renders the shared resource form inside
// a slide-up sheet; a full-page form is used for longer records.
export function FormSheet({ visible, onClose, title, children }: FormSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <Pressable className="flex-1" onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View className="bg-[#F4F4F6] dark:bg-[#0a0a0f] rounded-t-[28px] overflow-hidden" style={{ maxHeight: "88%" }}>
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1.5 rounded-full bg-[#D1D5DB] dark:bg-[#2a2a3a]" />
            </View>
            <View className="flex-row items-center justify-between px-6 pb-3">
              <Text className="text-[20px] font-bold text-[#0F1018] dark:text-white">{title}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                className="w-8 h-8 rounded-full items-center justify-center bg-white dark:bg-[#1a1a24] border border-[#E5E7EB] dark:border-[#2a2a3a]"
              >
                <Ionicons name="close" size={18} color="#9CA3AF" />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
