import "../global.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { queryClient } from "@/lib/query-client";
import { ImportProgressBanner } from "@/components/ui/import-progress-banner";

SplashScreen.preventAutoHideAsync();

function RootNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  // Declare BOTH groups and redirect imperatively. Conditionally rendering
  // one <Stack.Screen> sets the initial group but does NOT navigate when
  // auth flips after login — so a successful sign-in would leave you sitting
  // on the login screen. This effect moves you the moment auth changes.
  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    } else if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated, isLoading, segments]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <>
      <StatusBar style={palette.statusBar} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      {/* grit:mobile-banner — persistent background-import progress */}
      {isAuthenticated ? <ImportProgressBanner /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RootNav />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
