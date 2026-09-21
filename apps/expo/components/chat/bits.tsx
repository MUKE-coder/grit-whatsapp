import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import type { Tick } from "@/lib/chat";
import { resolveImageUrl } from "@/lib/images";

const palette = ["#059669", "#0284c7", "#7c3aed", "#d97706", "#e11d48", "#0d9488"];

/** Initials on a colour picked from the id, so a person keeps their colour everywhere. */
export function Avatar({
  id,
  name,
  src,
  size = 48,
  online = false,
}: {
  id: string;
  name: string;
  src?: string;
  size?: number;
  online?: boolean;
}) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <View style={{ width: size, height: size }}>
      {src ? (
        <Image
          source={{ uri: resolveImageUrl(src) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: palette[hash % palette.length],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: size * 0.36 }}>{initials}</Text>
        </View>
      )}
      {online && (
        <View
          accessibilityLabel="Online"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size,
            backgroundColor: "#10b981",
            borderWidth: 2,
            borderColor: "white",
          }}
        />
      )}
    </View>
  );
}

const tickLabel: Record<Tick, string> = {
  sending: "Sending",
  failed: "Not sent",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

/** One tick sent, two delivered, two light-blue read. On a coloured bubble. */
export function Ticks({ tick }: { tick: Tick }) {
  const icon =
    tick === "sending"
      ? "time-outline"
      : tick === "failed"
        ? "alert-circle"
        : tick === "sent"
          ? "checkmark"
          : "checkmark-done";
  const color = tick === "read" ? "#a5f3fc" : tick === "failed" ? "#ffffff" : "rgba(255,255,255,0.65)";
  return <Ionicons name={icon} size={15} color={color} accessibilityLabel={tickLabel[tick]} />;
}
