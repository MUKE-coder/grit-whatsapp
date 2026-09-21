import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { MessageForm } from "@/components/resource-forms/messages-form";
import { useCreateMessage } from "@/hooks/use-messages";

export const Route = createFileRoute("/app/messages/new")({
  component: NewMessagePage,
});

function NewMessagePage() {
  const navigate = useNavigate();
  const create = useCreateMessage();

  return (
    <div>
      <PageHeader title="New Message" description="Create a new message" />
      <div className="mt-6">
        <MessageForm
          submitting={create.isPending}
          submitLabel="Create Message"
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            navigate({ to: "/app/messages" });
          }}
        />
      </div>
    </div>
  );
}
