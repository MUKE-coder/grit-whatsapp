import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Image } from "expo-image";
import { useTheme } from "@/lib/theme";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Minimum 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

// Mirrors SOCIAL_AUTH_ENABLED from the root .env. Defaults to off: showing a
// provider button that no provider backs sends the user to a browser page
// reading "no provider for google exists".
const socialAuthEnabled =
  (process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED ?? "false").toLowerCase() === "true";

export default function LoginScreen() {
  const { login, verifyTOTP, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Set when the password was right and the account owes a 2FA code.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const { palette } = useTheme();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    setError("");
    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const challenge = await login(data.email, data.password);
      if (challenge) {
        setPendingToken(challenge.pendingToken);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!pendingToken) return;
    setError("");
    setLoading(true);
    try {
      await verifyTOTP({ pendingToken, code, trustDevice, backup: useBackup });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message || "That code was not accepted");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || "Google login failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  // The 2FA step replaces the credentials form rather than sitting beneath it,
  // so there is one obvious thing to do. Same shell, so it inherits the theme.
  if (pendingToken) {
    return (
      <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
        <FaintGrid />
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 18 }}
              keyboardShouldPersistTaps="handled"
            >
              <Animated.View
                entering={FadeInUp.duration(500)}
                className="rounded-[28px] bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] p-6"
              >
                <Text className="text-2xl font-bold text-[#111118] dark:text-white mb-1">
                  Two-factor authentication
                </Text>
                <Text className="text-[#6b7280] dark:text-[#9090a8] mb-5">
                  {useBackup
                    ? "Enter one of your backup codes."
                    : "Enter the 6-digit code from your authenticator app."}
                </Text>

                {error ? (
                  <View className="mb-4 rounded-xl bg-red-50 dark:bg-red-500/10 px-4 py-3">
                    <Text className="text-red-600 dark:text-red-400">{error}</Text>
                  </View>
                ) : null}

                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder={useBackup ? "XXXXXXXX" : "000000"}
                  placeholderTextColor="#9090a8"
                  keyboardType={useBackup ? "default" : "number-pad"}
                  autoCapitalize="characters"
                  maxLength={useBackup ? 8 : 6}
                  autoFocus
                  className="rounded-2xl border border-[#E5E7EB] dark:border-[#1f1f2b] bg-[#F9FAFB] dark:bg-[#0a0a0f] px-4 py-4 text-center text-xl text-[#111118] dark:text-white"
                />

                {!useBackup && (
                  <Pressable
                    onPress={() => setTrustDevice(!trustDevice)}
                    className="flex-row items-center mt-4"
                  >
                    <View
                      className={
                        "h-5 w-5 rounded border items-center justify-center mr-2 " +
                        (trustDevice
                          ? "bg-[#6c5ce7] border-[#6c5ce7]"
                          : "border-[#D1D5DB] dark:border-[#2a2a3a]")
                      }
                    >
                      {trustDevice ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                    </View>
                    <Text className="text-[#6b7280] dark:text-[#9090a8]">
                      Trust this device for 30 days
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={onVerify}
                  disabled={loading || code.trim().length < (useBackup ? 8 : 6)}
                  className="mt-6 rounded-2xl bg-[#6c5ce7] py-4 items-center"
                  style={{ opacity: loading || code.trim().length < (useBackup ? 8 : 6) ? 0.5 : 1 }}
                >
                  <Text className="text-white font-semibold text-base">
                    {loading ? "Verifying..." : "Verify and sign in"}
                  </Text>
                </Pressable>

                <View className="flex-row items-center justify-between mt-5">
                  <Pressable onPress={() => { setUseBackup(!useBackup); setCode(""); }}>
                    <Text className="text-[#6c5ce7] font-medium">
                      {useBackup ? "Use your app" : "Use a backup code"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPendingToken(null);
                      setCode("");
                      setUseBackup(false);
                      setError("");
                    }}
                  >
                    <Text className="text-[#6b7280] dark:text-[#9090a8]">Back</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  const emailBorder = errors.email ? "border-[#ff6b6b]" : "border-[#E5E7EB] dark:border-[#2a2a3a]";
  const passwordBorder = errors.password ? "border-[#ff6b6b]" : "border-[#E5E7EB] dark:border-[#2a2a3a]";

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <FaintGrid />
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 18 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              entering={FadeInUp.duration(500)}
              className="rounded-[28px] bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#1f1f2b] overflow-hidden"
              style={{
                shadowColor: "#6c5ce7",
                shadowOffset: { width: 0, height: 18 },
                shadowOpacity: 0.18,
                shadowRadius: 32,
                elevation: 8,
              }}
            >
              {/* Header — purple wash watermark */}
              <LinearGradient
                colors={palette.headerGradient}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ paddingTop: 36, paddingBottom: 16 }}
              >
                <View className="items-center">
                  <View
                    className="mb-5"
                    style={{
                      shadowColor: palette.logoShadow,
                      shadowOffset: { width: 0, height: 14 },
                      shadowOpacity: 0.35,
                      shadowRadius: 22,
                    }}
                  >
                    <Image
                      source={require("../../assets/icon.png")}
                      style={{ width: 76, height: 76, borderRadius: 20 }}
                      contentFit="contain"
                    />
                  </View>
                  <Text className="text-[28px] font-bold text-[#0F1018] dark:text-white tracking-tight">
                    Welcome back
                  </Text>
                  <Text className="text-[#6B7280] dark:text-[#9090a8] text-[14px] mt-1.5 px-6 text-center leading-5">
                    Sign in to your account to continue.
                  </Text>
                </View>
              </LinearGradient>

              {/* Form body */}
              <View className="px-7 pt-7 pb-7">
                {error ? (
                  <Animated.View
                    entering={FadeInUp.duration(280)}
                    className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center"
                  >
                    <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
                    <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{error}</Text>
                  </Animated.View>
                ) : null}

                {/* Email */}
                <View className="mb-4">
                  <Text className="text-[12.5px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2 tracking-tight">
                    Email Address
                  </Text>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View
                        className={"bg-[#F4F4F6] dark:bg-[#0a0a0f] border rounded-2xl flex-row items-center px-4 " + emailBorder}
                        style={{ height: 52 }}
                      >
                        <Ionicons name="mail-outline" size={17} color="#606078" />
                        <TextInput
                          className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
                          placeholder="you@example.com"
                          placeholderTextColor="#606078"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoComplete="email"
                          autoCorrect={false}
                        />
                      </View>
                    )}
                  />
                  {errors.email ? (
                    <Text className="text-[#ff6b6b] text-[11.5px] mt-1.5 ml-1">
                      {errors.email.message}
                    </Text>
                  ) : null}
                </View>

                {/* Password */}
                <View className="mb-6">
                  <Text className="text-[12.5px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2 tracking-tight">
                    Password
                  </Text>
                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View
                        className={"bg-[#F4F4F6] dark:bg-[#0a0a0f] border rounded-2xl flex-row items-center px-4 " + passwordBorder}
                        style={{ height: 52 }}
                      >
                        <Ionicons name="lock-closed-outline" size={17} color="#606078" />
                        <TextInput
                          className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
                          placeholder="••••••••"
                          placeholderTextColor="#606078"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setShowPassword((s) => !s);
                          }}
                          hitSlop={10}
                          className="ml-2 p-1"
                        >
                          <Ionicons
                            name={showPassword ? "eye-off-outline" : "eye-outline"}
                            size={19}
                            color={showPassword ? "#6c5ce7" : "#606078"}
                          />
                        </Pressable>
                      </View>
                    )}
                  />
                  {errors.password ? (
                    <Text className="text-[#ff6b6b] text-[11.5px] mt-1.5 ml-1">
                      {errors.password.message}
                    </Text>
                  ) : null}
                </View>

                {/* Primary CTA */}
                <PressableScale
                  onPress={handleSubmit(onSubmit)}
                  disabled={loading || googleLoading}
                  pressScale={0.97}
                  className="overflow-hidden rounded-full"
                  style={{
                    shadowColor: "#6c5ce7",
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.4,
                    shadowRadius: 18,
                    opacity: loading ? 0.85 : 1,
                  }}
                >
                  <LinearGradient
                    colors={["#7c6cf7", "#6c5ce7"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text className="text-white text-[15.5px] font-semibold tracking-tight">
                          Sign in
                        </Text>
                        <Ionicons name="arrow-forward" size={17} color="#FFFFFF" style={{ marginLeft: 8 }} />
                      </>
                    )}
                  </LinearGradient>
                </PressableScale>

                {/* Divider + social — hidden unless a provider is configured.
                    EXPO_PUBLIC_SOCIAL_AUTH_ENABLED mirrors SOCIAL_AUTH_ENABLED
                    from the root .env, matching the web and admin apps. Without
                    this check the button rendered on every fresh project and
                    dropped the user into a browser showing "no provider for
                    google exists". */}
                {socialAuthEnabled && (
                <>
                <View className="flex-row items-center my-6">
                  <View className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#2a2a3a]" />
                  <Text className="text-[#9CA3AF] dark:text-[#606078] mx-4 text-[12px]">or</Text>
                  <View className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#2a2a3a]" />
                </View>

                {/* Google */}
                <PressableScale
                  onPress={handleGoogleLogin}
                  disabled={loading || googleLoading}
                  className="rounded-full border border-[#E5E7EB] dark:border-[#2a2a3a] bg-[#F4F4F6] dark:bg-[#0a0a0f] flex-row items-center justify-center"
                  style={{ height: 52 }}
                >
                  {googleLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={19} color="#e8e8f0" />
                      <Text className="text-[#0F1018] dark:text-white font-semibold text-[15px] ml-3">
                        Continue with Google
                      </Text>
                    </>
                  )}
                </PressableScale>
                </>
                )}

                <View className="flex-row justify-center mt-6">
                  <Text className="text-[#6B7280] dark:text-[#9090a8] text-[13.5px]">Don't have an account? </Text>
                  <Link href="/(auth)/register">
                    <Text className="text-[#6c5ce7] font-semibold text-[13.5px]">Sign up</Text>
                  </Link>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// Subtle architectural grid behind the auth flow — ties login and
// register into one visual story.
function FaintGrid() {
  const { palette } = useTheme();
  return (
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: palette.gridOpacity }}
      pointerEvents="none"
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={"gv-" + i} style={{ width: 1, backgroundColor: palette.gridLine }} />
        ))}
      </View>
      <View style={{ flexDirection: "column", justifyContent: "space-between", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {Array.from({ length: 18 }).map((_, i) => (
          <View key={"gh-" + i} style={{ height: 1, backgroundColor: palette.gridLine }} />
        ))}
      </View>
    </View>
  );
}
