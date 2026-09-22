import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/tables/data-table";
import { ResourceDrawer } from "@/components/resource-drawer";
import { useConfirm } from "@/components/confirm-dialog";
import { ConversationForm } from "@/components/resource-forms/conversations-form";
import {
  useConversations,
  useCreateConversation,
  useUpdateConversation,
  useDeleteConversation,
  type Conversation,
} from "@/hooks/use-conversations";

export const Route = createFileRoute("/app/conversations/")({
  component: ConversationsPage,
});

const COLUMNS: DataColumn[] = [
  { key: "title", label: "Title", format: "text" },
  { key: "is_group", label: "Is Group", format: "boolean" },
  { key: "last_message_at", label: "Last Message At", format: "relative" },
  { key: "last_message_preview", label: "Last Message Preview", format: "text" },
  { key: "created_at", label: "Created", format: "relative" },
];

const SEARCH_KEYS = ["title", "last_message_preview"];

function ConversationsPage() {
  const { data: items = [], isLoading } = useConversations();
  const create = useCreateConversation();
  const update = useUpdateConversation();
  const del = useDeleteConversation();
  const confirm = useConfirm();
  const [drawer, setDrawer] = useState<{ open: boolean; record: Conversation | null }>({
    open: false,
    record: null,
  });

  const closeDrawer = () => setDrawer({ open: false, record: null });

  // Resolve belongs_to ids to the related record's name for the table.
  const rows = items;

  return (
    <div>
      <PageHeader title="Conversations" description="Manage your conversations" />

      <div className="mt-6">
        <DataTable<Conversation>
          title="Conversations"
          singular="Conversation"
          columns={COLUMNS}
          rows={rows}
          loading={isLoading}
          searchKeys={SEARCH_KEYS}
          onNew={() => setDrawer({ open: true, record: null })}
          onEdit={(row) => setDrawer({ open: true, record: row })}
          onDelete={async (row) => {
            if (await confirm({ title: "Delete conversation", message: "This will delete this conversation. This action cannot be undone.", danger: true, confirmLabel: "Delete" })) del.mutate(String(row.id));
          }}
          onBulkDelete={async (rows) => {
            if (await confirm({ title: "Delete conversations", message: "Delete " + rows.length + " conversation(s)? This cannot be undone.", danger: true, confirmLabel: "Delete" })) rows.forEach((r) => { del.mutate(String(r.id)); });
          }}
          onImport={(records) => records.forEach((rec) => { create.mutate(rec); })}
        />
      </div>

      <ResourceDrawer
        open={drawer.open}
        title={drawer.record ? "Edit Conversation" : "New Conversation"}
        description={drawer.record ? "Update this conversation" : "Create a new conversation"}
        onClose={closeDrawer}
      >
        <ConversationForm
          record={drawer.record}
          submitting={create.isPending || update.isPending}
          submitLabel={drawer.record ? "Save changes" : "Create Conversation"}
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
