import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ui/screen-header";
import { ConversationForm } from "@/components/resource-forms/conversations-form";
import { useCreateConversation } from "@/hooks/use-conversations";

export default function CreateConversationScreen() {
  const router = useRouter();
  const create = useCreateConversation();
  return (
    <View className="flex-1 bg-[#F4F4F6] dark:bg-[#0a0a0f]">
      <ScreenHeader title="New Conversation" showBack />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ConversationForm
          submitting={create.isPending}
          submitLabel="Create Conversation"
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            router.back();
          }}
        />
      </ScrollView>
    </View>
  );
}
