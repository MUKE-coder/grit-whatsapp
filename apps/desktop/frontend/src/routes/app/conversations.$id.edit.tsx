import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { ConversationForm } from "@/components/resource-forms/conversations-form";
import { useConversation, useUpdateConversation } from "@/hooks/use-conversations";

export const Route = createFileRoute("/app/conversations/$id/edit")({
  component: EditConversationPage,
});

function EditConversationPage() {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/app/conversations/$id/edit" });
  const { data: record, isLoading } = useConversation(id);
  const update = useUpdateConversation();

  if (isLoading) return <div className="text-[13px] text-foreground-muted">Loading…</div>;

  return (
    <div>
      <PageHeader title="Edit Conversation" description="Update this conversation" />
      <div className="mt-6">
        <ConversationForm
          record={record}
          submitting={update.isPending}
          submitLabel="Save Changes"
          onSubmit={async (values) => {
            await update.mutateAsync({ id, data: values });
            navigate({ to: "/app/conversations" });
          }}
        />
      </div>
    </div>
  );
}
