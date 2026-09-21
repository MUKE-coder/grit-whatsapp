import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { ConversationForm } from "@/components/resource-forms/conversations-form";
import { useCreateConversation } from "@/hooks/use-conversations";

export const Route = createFileRoute("/app/conversations/new")({
  component: NewConversationPage,
});

function NewConversationPage() {
  const navigate = useNavigate();
  const create = useCreateConversation();

  return (
    <div>
      <PageHeader title="New Conversation" description="Create a new conversation" />
      <div className="mt-6">
        <ConversationForm
          submitting={create.isPending}
          submitLabel="Create Conversation"
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            navigate({ to: "/app/conversations" });
          }}
        />
      </div>
    </div>
  );
}
