import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenHeader } from "@/components/ui/screen-header";
import { api } from "@/lib/api";

interface Status {
  enabled: boolean;
  backup_codes_remaining: number;
  trusted_devices: number;
}

export default function TwoFactorScreen() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [password, setPassword] = useState("");
  const [disabling, setDisabling] = useState(false);

  const refresh = async () => {
    try {
      const res = await api.get("/auth/totp/status");
      setStatus(res.data);
    } catch (e: any) {
      setError(e.message || "Could not load your two-factor settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const startSetup = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/auth/totp/setup", {});
      setSecret(res.data.secret);
      setQr(res.data.qr_code);
    } catch (e: any) {
      setError(e.message || "Could not start setup");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (!secret) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/auth/totp/enable", { secret, code: code.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCodes(res.data.backup_codes);
      setSaved(false);
      setSecret(null);
      setQr(null);
      setCode("");
      refresh();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e.message || "That code was not accepted");
    } finally {
      setBusy(false);
    }
  };

  const shareCodes = async () => {
    if (!codes) return;
    try {
      await Share.share({ message: codes.join("\n") });
      // Sharing can be cancelled, and there is no reliable way to tell on
      // every platform. Treat the attempt as enough - the alternative is a
      // panel the user cannot leave.
      setSaved(true);
    } catch {
      setSaved(true);
    }
  };

  const regenerate = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/auth/totp/backup-codes", {});
      setCodes(res.data.backup_codes);
      setSaved(false);
      refresh();
    } catch (e: any) {
      setError(e.message || "Could not generate new codes");
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/totp/disable", { password });
      setDisabling(false);
      setPassword("");
      refresh();
    } catch (e: any) {
      setError(e.message || "Could not turn two-factor off");
    } finally {
      setBusy(false);
    }
  };

  const card =
    "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl p-5";
  const field =
    "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4";

  if (loading) {
    return (
      <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
        <ScreenHeader title="Two-Factor" subtitle="Extra security on sign in" showBack />
        <ActivityIndicator className="mt-10" color="#6c5ce7" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader
        title="Two-Factor"
        subtitle={status?.enabled ? "On" : "Off"}
        showBack
      />

      <ScrollView className="px-6 pt-2" contentContainerClassName="pb-28">
        {error ? (
          <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
            <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{error}</Text>
          </View>
        ) : null}

        {/* Backup codes, shown once and only once. */}
        {codes ? (
          <View className="bg-[#fdcb6e]/10 border border-[#fdcb6e]/40 rounded-2xl p-5 mb-4">
            <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white mb-1">
              Save your backup codes
            </Text>
            <Text className="text-[12.5px] text-[#6B7280] dark:text-[#9090a8] mb-3">
              Each code works once, if you lose your authenticator. This is the only time they
              are shown - the server keeps only hashes.
            </Text>

            <View className="flex-row flex-wrap -mx-1 mb-3">
              {codes.map((c) => (
                <View key={c} className="w-1/2 px-1 mb-2">
                  <Text className="bg-[#F4F4F6] dark:bg-[#1a1a24] rounded-lg py-2 text-center font-mono tracking-widest text-[13px] text-[#0F1018] dark:text-white">
                    {c}
                  </Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={shareCodes}
              className="bg-[#6c5ce7] rounded-full py-3 items-center mb-2 flex-row justify-center"
            >
              <Ionicons name="share-outline" size={17} color="#fff" />
              <Text className="text-white font-semibold text-[14px] ml-2">Save or share</Text>
            </Pressable>

            <Pressable
              onPress={() => setCodes(null)}
              disabled={!saved}
              className="rounded-full py-3 items-center border border-[#E5E7EB] dark:border-[#2a2a3a]"
              style={{ opacity: saved ? 1 : 0.5 }}
            >
              <Text className="text-[#0F1018] dark:text-white font-semibold text-[14px]">
                {saved ? "I have saved them" : "Save them first"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Off, and not mid-setup. */}
        {!status?.enabled && !secret && !codes ? (
          <View className={card}>
            <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white mb-1">
              Add a second step
            </Text>
            <Text className="text-[12.5px] text-[#6B7280] dark:text-[#9090a8] mb-4">
              A code from your authenticator app, on top of your password.
            </Text>
            <Pressable
              onPress={startSetup}
              disabled={busy}
              className="bg-[#6c5ce7] rounded-full py-3.5 items-center"
              style={{ opacity: busy ? 0.7 : 1 }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-[15px]">Turn on two-factor</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* Mid-setup: scan, then confirm with a live code. */}
        {secret && qr ? (
          <View className={card}>
            <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white mb-1">
              Scan this code
            </Text>
            <Text className="text-[12.5px] text-[#6B7280] dark:text-[#9090a8] mb-4">
              Open Google Authenticator, 1Password or Authy on another device and scan. On this
              phone, enter the key below by hand instead.
            </Text>

            <View className="items-center mb-4">
              <View className="bg-white rounded-2xl p-3">
                <Image
                  source={{ uri: qr }}
                  style={{ width: 180, height: 180 }}
                  accessibilityLabel="Two-factor setup QR code"
                />
              </View>
            </View>

            <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-1.5">
              Setup key
            </Text>
            <Text className="bg-[#F4F4F6] dark:bg-[#1a1a24] rounded-xl px-3 py-2.5 font-mono text-[12px] text-[#0F1018] dark:text-white mb-4">
              {secret}
            </Text>

            <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-1.5">
              Code from your app
            </Text>
            <View className={field} style={{ height: 52, justifyContent: "center" }}>
              <TextInput
                className="text-[#0F1018] dark:text-white text-[17px] text-center tracking-[8px]"
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </View>

            <Pressable
              onPress={confirmEnable}
              disabled={busy || code.trim().length !== 6}
              className="bg-[#6c5ce7] rounded-full py-3.5 items-center mt-4"
              style={{ opacity: busy || code.trim().length !== 6 ? 0.5 : 1 }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-[15px]">Verify and turn on</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => { setSecret(null); setQr(null); setCode(""); }}
              className="py-3 items-center mt-1"
            >
              <Text className="text-[#6B7280] dark:text-[#9090a8] text-[14px]">Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {/* On: codes left, regenerate, turn off. */}
        {status?.enabled && !codes ? (
          <View className={card}>
            <View className="flex-row items-center mb-4">
              <Ionicons name="shield-checkmark" size={20} color="#00b894" />
              <Text className="text-[15px] font-semibold text-[#0F1018] dark:text-white ml-2 flex-1">
                Two-factor is on
              </Text>
            </View>

            <Text className="text-[12.5px] text-[#6B7280] dark:text-[#9090a8] mb-3">
              {status.backup_codes_remaining} backup code
              {status.backup_codes_remaining === 1 ? "" : "s"} left.
            </Text>

            <Pressable
              onPress={regenerate}
              disabled={busy}
              className="rounded-full py-3 items-center border border-[#E5E7EB] dark:border-[#2a2a3a] mb-4"
            >
              <Text className="text-[#0F1018] dark:text-white font-semibold text-[14px]">
                Generate new codes
              </Text>
            </Pressable>

            {disabling ? (
              <View>
                <Text className="text-[12px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-1.5">
                  Confirm your password
                </Text>
                <View className={field} style={{ height: 52, justifyContent: "center" }}>
                  <TextInput
                    className="text-[#0F1018] dark:text-white text-[15px]"
                    placeholder="Your password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
                <Pressable
                  onPress={confirmDisable}
                  disabled={busy || !password}
                  className="bg-[#ff6b6b] rounded-full py-3.5 items-center mt-3"
                  style={{ opacity: busy || !password ? 0.5 : 1 }}
                >
                  <Text className="text-white font-semibold text-[15px]">Turn off two-factor</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setDisabling(false); setPassword(""); }}
                  className="py-3 items-center"
                >
                  <Text className="text-[#6B7280] dark:text-[#9090a8] text-[14px]">Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Turn off two-factor?",
                    "Your password alone will sign you in.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Continue", style: "destructive", onPress: () => setDisabling(true) },
                    ]
                  )
                }
                className="py-2 items-center"
              >
                <Text className="text-[#ff6b6b] text-[14px] font-semibold">
                  Turn off two-factor authentication
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
