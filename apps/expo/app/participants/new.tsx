import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ui/screen-header";
import { ParticipantForm } from "@/components/resource-forms/participants-form";
import { useCreateParticipant } from "@/hooks/use-participants";

export default function CreateParticipantScreen() {
  const router = useRouter();
  const create = useCreateParticipant();
  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="New Participant" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ParticipantForm
          submitting={create.isPending}
          submitLabel="Create Participant"
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            router.back();
          }}
        />
      </ScrollView>
    </View>
  );
}
