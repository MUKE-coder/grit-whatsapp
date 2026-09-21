import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { ParticipantForm } from "@/components/resource-forms/participants-form";
import { useParticipant, useUpdateParticipant } from "@/hooks/use-participants";

export const Route = createFileRoute("/app/participants/$id/edit")({
  component: EditParticipantPage,
});

function EditParticipantPage() {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/app/participants/$id/edit" });
  const { data: record, isLoading } = useParticipant(id);
  const update = useUpdateParticipant();

  if (isLoading) return <div className="text-[13px] text-foreground-muted">Loading…</div>;

  return (
    <div>
      <PageHeader title="Edit Participant" description="Update this participant" />
      <div className="mt-6">
        <ParticipantForm
          record={record}
          submitting={update.isPending}
          submitLabel="Save Changes"
          onSubmit={async (values) => {
            await update.mutateAsync({ id, data: values });
            navigate({ to: "/app/participants" });
          }}
        />
      </div>
    </div>
  );
}
