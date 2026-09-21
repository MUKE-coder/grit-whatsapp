import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { MessageForm } from "@/components/resource-forms/messages-form";
import { useMessage, useUpdateMessage } from "@/hooks/use-messages";

export const Route = createFileRoute("/app/messages/$id/edit")({
  component: EditMessagePage,
});

function EditMessagePage() {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/app/messages/$id/edit" });
  const { data: record, isLoading } = useMessage(id);
  const update = useUpdateMessage();

  if (isLoading) return <div className="text-[13px] text-foreground-muted">Loading…</div>;

  return (
    <div>
      <PageHeader title="Edit Message" description="Update this message" />
      <div className="mt-6">
        <MessageForm
          record={record}
          submitting={update.isPending}
          submitLabel="Save Changes"
          onSubmit={async (values) => {
            await update.mutateAsync({ id, data: values });
            navigate({ to: "/app/messages" });
          }}
        />
      </div>
    </div>
  );
}
