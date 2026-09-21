import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ui/screen-header";
import { MessageForm } from "@/components/resource-forms/messages-form";
import { useCreateMessage } from "@/hooks/use-messages";

export default function CreateMessageScreen() {
  const router = useRouter();
  const create = useCreateMessage();
  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="New Message" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <MessageForm
          submitting={create.isPending}
          submitLabel="Create Message"
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            router.back();
          }}
        />
      </ScrollView>
    </View>
  );
}
