import { useState } from "react";
import { View, Text, Pressable, Image, ActivityIndicator, ScrollView, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { FormSheet } from "./form-sheet";

interface ImagePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  multiple?: boolean;
  onSelect: (uris: string[]) => void;
}

export function ImagePickerSheet({ visible, onClose, multiple, onSelect }: ImagePickerSheetProps) {
  const [assets, setAssets] = useState<string[]>([]);
  const [permError, setPermError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setAssets([]);
    setPermError("");
    setBusy(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const fromLibrary = async (crop = false) => {
    setPermError("");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPermError("Photo library access is off. Turn it on in Settings to choose photos.");
      return;
    }
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: crop,
        aspect: [1, 1],
        quality: 0.8,
        allowsMultipleSelection: !crop && !!multiple,
        selectionLimit: multiple ? 10 : 1,
      });
      if (!res.canceled && res.assets?.length) {
        setAssets(res.assets.map((a) => a.uri));
      }
    } finally {
      setBusy(false);
    }
  };

  const fromCamera = async () => {
    setPermError("");
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setPermError("Camera access is off. Turn it on in Settings to take a photo.");
      return;
    }
    setBusy(true);
    try {
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!res.canceled && res.assets?.length) setAssets(res.assets.map((a) => a.uri));
    } finally {
      setBusy(false);
    }
  };

  const use = () => {
    const chosen = assets;
    onSelect(chosen);
    close();
  };

  return (
    <FormSheet visible={visible} onClose={close} title={multiple ? "Add photos" : "Add photo"}>
      {permError ? (
        <View className="bg-[#fdcb6e]/10 border border-[#fdcb6e]/30 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-[13px] text-[#0F1018] dark:text-white mb-2">{permError}</Text>
          <Pressable onPress={() => Linking.openSettings()}>
            <Text className="text-[#6c5ce7] font-semibold text-[13px]">Open Settings</Text>
          </Pressable>
        </View>
      ) : null}

      {assets.length ? (
        <View>
          {assets.length === 1 ? (
            <Image source={{ uri: assets[0] }} style={{ width: "100%", height: 220, borderRadius: 16 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-1">
              {assets.map((u, i) => (
                <Image key={i} source={{ uri: u }} style={{ width: 96, height: 96, borderRadius: 12, marginRight: 8 }} />
              ))}
            </ScrollView>
          )}
          <Pressable onPress={use} className="bg-[#6c5ce7] rounded-full py-4 items-center mt-4">
            <Text className="text-white font-semibold text-[15px]">
              {multiple ? "Use " + assets.length + " photo" + (assets.length > 1 ? "s" : "") : "Use photo"}
            </Text>
          </Pressable>
          {!multiple ? (
            <Pressable onPress={() => fromLibrary(true)} className="rounded-full py-3 items-center mt-2 flex-row justify-center">
              <Ionicons name="crop-outline" size={16} color="#6c5ce7" />
              <Text className="text-[#6c5ce7] font-semibold text-[14px] ml-2">Crop instead</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setAssets([])} className="rounded-full py-3 items-center">
            <Text className="text-[#6B7280] dark:text-[#9090a8] font-semibold text-[14px]">Choose different</Text>
          </Pressable>
        </View>
      ) : busy ? (
        <View className="py-12 items-center">
          <ActivityIndicator color="#6c5ce7" />
          <Text className="text-[13px] text-[#6B7280] dark:text-[#9090a8] mt-3">Opening…</Text>
        </View>
      ) : (
        <View className="py-1">
          <SourceButton
            icon="images-outline"
            label="Choose from library"
            hint={multiple ? "Select one or more photos" : "Pick a photo from your gallery"}
            onPress={() => fromLibrary(false)}
          />
          <SourceButton icon="camera-outline" label="Take a photo" hint="Use your camera" onPress={fromCamera} />
        </View>
      )}
    </FormSheet>
  );
}

function SourceButton({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-4 mb-3"
    >
      <View className="w-11 h-11 rounded-full bg-[#6c5ce7]/10 items-center justify-center">
        <Ionicons name={icon as any} size={22} color="#6c5ce7" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white">{label}</Text>
        <Text className="text-[12px] text-[#6B7280] dark:text-[#9090a8] mt-0.5">{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </Pressable>
  );
}
