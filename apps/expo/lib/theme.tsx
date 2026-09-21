import { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme, colorScheme as nwColorScheme } from "nativewind";
import * as SecureStore from "@/lib/secure-store";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "theme_mode";

// Default to light before the first paint — even on a device whose OS is
// in dark mode — so the app opens light unless the user saved otherwise.
// The provider then reads the persisted choice and overrides if needed.
nwColorScheme.set("light");

// JS-side colours for the things className/dark: variants can't reach:
// gradients, the faint auth grid, blur tint, status bar, tab bar chrome.
export interface Palette {
  scheme: "light" | "dark";
  statusBar: "light" | "dark";
  headerGradient: [string, string, string];
  logoShadow: string;
  gridLine: string;
  gridOpacity: number;
  inputIcon: string;
  placeholder: string;
  tabBar: string;
  tabBarBorder: string;
  tabInactive: string;
  blurTint: "light" | "dark";
  refresh: string;
}

const LIGHT: Palette = {
  scheme: "light",
  statusBar: "dark",
  headerGradient: ["#EFEBFF", "#F6F4FF", "#FFFFFF"],
  logoShadow: "#6c5ce7",
  gridLine: "#0f1018",
  gridOpacity: 0.04,
  inputIcon: "#9CA3AF",
  placeholder: "#9CA3AF",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E5E7EB",
  tabInactive: "#9CA3AF",
  blurTint: "light",
  refresh: "#6c5ce7",
};

const DARK: Palette = {
  scheme: "dark",
  statusBar: "light",
  headerGradient: ["#1c1830", "#15121f", "#111118"],
  logoShadow: "#6c5ce7",
  gridLine: "#e8e8f0",
  gridOpacity: 0.06,
  inputIcon: "#606078",
  placeholder: "#606078",
  tabBar: "#15151d",
  tabBarBorder: "#22222e",
  tabInactive: "#606078",
  blurTint: "dark",
  refresh: "#6c5ce7",
};

interface ThemeContextType {
  mode: ThemeMode;
  scheme: "light" | "dark";
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "light",
  scheme: "light",
  palette: LIGHT,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    // Default is light; only override once we've read the saved choice.
    SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      const next = (saved as ThemeMode) || "light";
      setModeState(next);
      setColorScheme(next);
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    setColorScheme(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  };

  const scheme: "light" | "dark" = colorScheme === "dark" ? "dark" : "light";
  const palette = scheme === "dark" ? DARK : LIGHT;

  return (
    <ThemeContext value={{ mode, scheme, palette, setMode }}>
      {children}
    </ThemeContext>
  );
}

export const useTheme = () => useContext(ThemeContext);
