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

const registerSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Minimum 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const { register: registerUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { palette } = useTheme();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    setError("");
    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await registerUser(data.firstName, data.lastName, data.email, data.password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const inputBase = "bg-[#F4F4F6] dark:bg-[#0a0a0f] border rounded-2xl flex-row items-center px-4";
  const border = (hasError?: boolean) => (hasError ? "border-[#ff6b6b]" : "border-[#E5E7EB] dark:border-[#2a2a3a]");
  const label = "text-[12.5px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2 tracking-tight";
  const errorText = "text-[#ff6b6b] text-[11.5px] mt-1.5 ml-1";

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
                    Create account
                  </Text>
                  <Text className="text-[#6B7280] dark:text-[#9090a8] text-[14px] mt-1.5 px-6 text-center leading-5">
                    Get started with Grit in seconds.
                  </Text>
                </View>
              </LinearGradient>

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

                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Text className={label}>First name</Text>
                    <Controller
                      control={control}
                      name="firstName"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <View className={inputBase + " " + border(!!errors.firstName)} style={{ height: 52 }}>
                          <TextInput
                            className="flex-1 text-[#0F1018] dark:text-white text-[15px]"
                            placeholder="John"
                            placeholderTextColor="#606078"
                            value={value}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            autoComplete="given-name"
                          />
                        </View>
                      )}
                    />
                    {errors.firstName ? (
                      <Text className={errorText}>{errors.firstName.message}</Text>
                    ) : null}
                  </View>
                  <View className="flex-1">
                    <Text className={label}>Last name</Text>
                    <Controller
                      control={control}
                      name="lastName"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <View className={inputBase + " " + border(!!errors.lastName)} style={{ height: 52 }}>
                          <TextInput
                            className="flex-1 text-[#0F1018] dark:text-white text-[15px]"
                            placeholder="Doe"
                            placeholderTextColor="#606078"
                            value={value}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            autoComplete="family-name"
                          />
                        </View>
                      )}
                    />
                    {errors.lastName ? (
                      <Text className={errorText}>{errors.lastName.message}</Text>
                    ) : null}
                  </View>
                </View>

                <View className="mb-4">
                  <Text className={label}>Email Address</Text>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View className={inputBase + " " + border(!!errors.email)} style={{ height: 52 }}>
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
                  {errors.email ? <Text className={errorText}>{errors.email.message}</Text> : null}
                </View>

                <View className="mb-4">
                  <Text className={label}>Password</Text>
                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View className={inputBase + " " + border(!!errors.password)} style={{ height: 52 }}>
                        <Ionicons name="lock-closed-outline" size={17} color="#606078" />
                        <TextInput
                          className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
                          placeholder="Min. 8 characters"
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
                  {errors.password ? <Text className={errorText}>{errors.password.message}</Text> : null}
                </View>

                <View className="mb-6">
                  <Text className={label}>Confirm password</Text>
                  <Controller
                    control={control}
                    name="confirmPassword"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View className={inputBase + " " + border(!!errors.confirmPassword)} style={{ height: 52 }}>
                        <Ionicons name="lock-closed-outline" size={17} color="#606078" />
                        <TextInput
                          className="flex-1 ml-2.5 text-[#0F1018] dark:text-white text-[15px]"
                          placeholder="Repeat password"
                          placeholderTextColor="#606078"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                    )}
                  />
                  {errors.confirmPassword ? (
                    <Text className={errorText}>{errors.confirmPassword.message}</Text>
                  ) : null}
                </View>

                <PressableScale
                  onPress={handleSubmit(onSubmit)}
                  disabled={loading}
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
                          Create account
                        </Text>
                        <Ionicons name="arrow-forward" size={17} color="#FFFFFF" style={{ marginLeft: 8 }} />
                      </>
                    )}
                  </LinearGradient>
                </PressableScale>

                <View className="flex-row justify-center mt-6">
                  <Text className="text-[#6B7280] dark:text-[#9090a8] text-[13.5px]">Already have an account? </Text>
                  <Link href="/(auth)/login">
                    <Text className="text-[#6c5ce7] font-semibold text-[13.5px]">Sign in</Text>
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
