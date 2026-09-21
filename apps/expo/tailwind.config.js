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
          DEFAULT: "#6c5ce7",
          hover: "#7c6cf7",
        },
        success: "#00b894",
        danger: "#ff6b6b",
        warning: "#fdcb6e",
        info: "#74b9ff",
      },
    },
  },
  plugins: [],
};
