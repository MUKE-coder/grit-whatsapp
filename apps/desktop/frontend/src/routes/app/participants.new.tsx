import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { ParticipantForm } from "@/components/resource-forms/participants-form";
import { useCreateParticipant } from "@/hooks/use-participants";

export const Route = createFileRoute("/app/participants/new")({
  component: NewParticipantPage,
});

function NewParticipantPage() {
  const navigate = useNavigate();
  const create = useCreateParticipant();

  return (
    <div>
      <PageHeader title="New Participant" description="Create a new participant" />
      <div className="mt-6">
        <ParticipantForm
          submitting={create.isPending}
          submitLabel="Create Participant"
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            navigate({ to: "/app/participants" });
          }}
        />
      </div>
    </div>
  );
}
