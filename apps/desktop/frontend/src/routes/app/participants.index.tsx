import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/tables/data-table";
import { ResourceDrawer } from "@/components/resource-drawer";
import { useConfirm } from "@/components/confirm-dialog";
import { ParticipantForm } from "@/components/resource-forms/participants-form";
import {
  useParticipants,
  useCreateParticipant,
  useUpdateParticipant,
  useDeleteParticipant,
  type Participant,
} from "@/hooks/use-participants";
import { useConversations } from "@/hooks/use-conversations";
import { useUsers } from "@/hooks/use-users";

export const Route = createFileRoute("/app/participants/")({
  component: ParticipantsPage,
});

const COLUMNS: DataColumn[] = [
  { key: "conversation", label: "Conversation", format: "text" },
  { key: "user", label: "User", format: "text" },
  { key: "role", label: "Role", format: "text" },
  { key: "last_read_at", label: "Last Read At", format: "relative" },
  { key: "last_delivered_at", label: "Last Delivered At", format: "relative" },
  { key: "muted", label: "Muted", format: "boolean" },
  { key: "created_at", label: "Created", format: "relative" },
];

const SEARCH_KEYS = ["id"];

function ParticipantsPage() {
  const { data: items = [], isLoading } = useParticipants();
  const create = useCreateParticipant();
  const update = useUpdateParticipant();
  const del = useDeleteParticipant();
  const confirm = useConfirm();
  const [drawer, setDrawer] = useState<{ open: boolean; record: Participant | null }>({
    open: false,
    record: null,
  });

  const closeDrawer = () => setDrawer({ open: false, record: null });

  // Resolve belongs_to ids to the related record's name for the table.
  const conversationMap = new Map((useConversations().data ?? []).map((o: any) => [String(o.id), String(o.name ?? o.title ?? o.id)]));
  const userMap = new Map((useUsers().data ?? []).map((o: any) => [String(o.id), String(o.name ?? o.title ?? o.id)]));
  const rows = items.map((r) => ({ ...r, conversation: conversationMap.get(String((r as any).conversation_id)) ?? "", user: userMap.get(String((r as any).user_id)) ?? "" }));

  return (
    <div>
      <PageHeader title="Participants" description="Manage your participants" />

      <div className="mt-6">
        <DataTable<Participant>
          title="Participants"
          singular="Participant"
          columns={COLUMNS}
          rows={rows}
          loading={isLoading}
          searchKeys={SEARCH_KEYS}
          onNew={() => setDrawer({ open: true, record: null })}
          onEdit={(row) => setDrawer({ open: true, record: row })}
          onDelete={async (row) => {
            if (await confirm({ title: "Delete participant", message: "This will delete this participant. This action cannot be undone.", danger: true, confirmLabel: "Delete" })) del.mutate(String(row.id));
          }}
          onBulkDelete={async (rows) => {
            if (await confirm({ title: "Delete participants", message: "Delete " + rows.length + " participant(s)? This cannot be undone.", danger: true, confirmLabel: "Delete" })) rows.forEach((r) => del.mutate(String(r.id)));
          }}
          onImport={(records) => records.forEach((rec) => create.mutate(rec))}
        />
      </div>

      <ResourceDrawer
        open={drawer.open}
        title={drawer.record ? "Edit Participant" : "New Participant"}
        description={drawer.record ? "Update this participant" : "Create a new participant"}
        onClose={closeDrawer}
      >
        <ParticipantForm
          record={drawer.record}
          submitting={create.isPending || update.isPending}
          submitLabel={drawer.record ? "Save changes" : "Create Participant"}
          onCancel={closeDrawer}
          onSubmit={async (values) => {
            if (drawer.record) {
              await update.mutateAsync({ id: String(drawer.record.id), data: values });
            } else {
              await create.mutateAsync(values);
            }
            closeDrawer();
          }}
        />
      </ResourceDrawer>
    </div>
  );
}
