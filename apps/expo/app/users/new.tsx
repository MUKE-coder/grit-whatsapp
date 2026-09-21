import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Switch, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface Role {
  id: string;
  name: string;
  description: string;
}

export default function CreateUserScreen() {
  const router = useRouter();

  // Roles are whatever the project defines. This list used to be hardcoded to
  // ["ADMIN","EDITOR","USER"], so a role created in the admin never appeared
  // here and could not be assigned from a phone.
  const { data: roles } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await api.get("/roles");
      return (res.data ?? []) as Role[];
    },
  });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a] rounded-2xl px-4 py-3.5 text-[#0F1018] dark:text-white text-[15px] mb-4";
  const labelClass = "text-[13px] font-semibold text-[#6B7280] dark:text-[#9090a8] mb-2";

  const onSubmit = async () => {
    setError("");
    if (!firstName.trim() || !lastName.trim()) return setError("Name is required");
    if (!email.includes("@")) return setError("Enter a valid email");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    setSaving(true);
    try {
      // POST /users, not /admin/users — the latter is not a registered route
      // and every create from mobile 404'd.
      const created = await api.post("/users", {
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role,
        active,
      });

      // Bind the user to the role record itself, so custom roles grant their
      // permissions. The role string above is the legacy field and only
      // covers the three built-ins.
      const newUserId = created.data?.id;
      const picked = roles?.find((r) => r.name === role);
      if (newUserId && picked) {
        await api.put("/users/" + newUserId + "/roles", { role_ids: [picked.id] });
      }
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="New User" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/25 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
            <Text className="text-[#ff6b6b] text-[13px] ml-2 flex-1">{error}</Text>
          </View>
        ) : null}

        <Text className={labelClass}>First name</Text>
        <TextInput className={inputClass} placeholder="First name" placeholderTextColor="#9CA3AF" value={firstName} onChangeText={setFirstName} />
        <Text className={labelClass}>Last name</Text>
        <TextInput className={inputClass} placeholder="Last name" placeholderTextColor="#9CA3AF" value={lastName} onChangeText={setLastName} />
        <Text className={labelClass}>Email</Text>
        <TextInput className={inputClass} placeholder="you@example.com" placeholderTextColor="#9CA3AF" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Text className={labelClass}>Password</Text>
        <TextInput className={inputClass} placeholder="Min. 6 characters" placeholderTextColor="#9CA3AF" value={password} onChangeText={setPassword} secureTextEntry />

        <Text className={labelClass}>Role</Text>
        <View className="flex-row mb-4">
          {roles?.map((rr) => rr.name).map((r) => (
            <Pressable key={r} onPress={() => setRole(r)} className={role === r ? "px-4 py-2 mr-2 rounded-full bg-[#6c5ce7]" : "px-4 py-2 mr-2 rounded-full bg-white dark:bg-[#111118] border border-[#E5E7EB] dark:border-[#2a2a3a]"}>
              <Text className={role === r ? "text-white font-medium capitalize" : "text-[#0F1018] dark:text-white capitalize"}>{r.toLowerCase()}</Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row items-center justify-between mb-4">
          <Text className={labelClass} style={{ marginBottom: 0 }}>Active</Text>
          <Switch value={active} onValueChange={setActive} trackColor={{ false: "#D1D5DB", true: "#6c5ce7" }} thumbColor="#ffffff" />
        </View>

        <Pressable onPress={onSubmit} disabled={saving} className="bg-[#6c5ce7] rounded-full py-4 items-center mt-2" style={{ opacity: saving ? 0.7 : 1 }}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-[15px]">Create user</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}
