/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./lib/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Class-based dark mode: the ThemeProvider drives it via NativeWind's
  // setColorScheme() so we control light/dark explicitly (default light),
  // instead of blindly following the OS setting.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0a0a0f",
          secondary: "#111118",
          tertiary: "#1a1a24",
          elevated: "#22222e",
          hover: "#2a2a38",
        },
        border: "#2a2a3a",
        accent: {
          DEFAULT: "#2563eb",
          hover: "#1d4ed8",
        },
        success: "#10b981",
        danger: "#ef4444",
        warning: "#f59e0b",
        info: "#0ea5e9",
      },
    },
  },
  plugins: [],
};
