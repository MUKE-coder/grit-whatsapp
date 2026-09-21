import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/tables/data-table";
import { ResourceDrawer } from "@/components/resource-drawer";
import { useConfirm } from "@/components/confirm-dialog";
import { MessageForm } from "@/components/resource-forms/messages-form";
import {
  useMessages,
  useCreateMessage,
  useUpdateMessage,
  useDeleteMessage,
  type Message,
} from "@/hooks/use-messages";
import { useConversations } from "@/hooks/use-conversations";
import { useUsers } from "@/hooks/use-users";

export const Route = createFileRoute("/app/messages/")({
  component: MessagesPage,
});

const COLUMNS: DataColumn[] = [
  { key: "conversation", label: "Conversation", format: "text" },
  { key: "sender", label: "Sender", format: "text" },
  { key: "body", label: "Body", format: "text" },
  { key: "kind", label: "Kind", format: "text" },
  { key: "attachment", label: "Attachment", format: "image" },
  { key: "created_at", label: "Created", format: "relative" },
];

const SEARCH_KEYS = ["body"];

function MessagesPage() {
  const { data: items = [], isLoading } = useMessages();
  const create = useCreateMessage();
  const update = useUpdateMessage();
  const del = useDeleteMessage();
  const confirm = useConfirm();
  const [drawer, setDrawer] = useState<{ open: boolean; record: Message | null }>({
    open: false,
    record: null,
  });

  const closeDrawer = () => setDrawer({ open: false, record: null });

  // Resolve belongs_to ids to the related record's name for the table.
  const conversationMap = new Map((useConversations().data ?? []).map((o: any) => [String(o.id), String(o.name ?? o.title ?? o.id)]));
  const senderMap = new Map((useUsers().data ?? []).map((o: any) => [String(o.id), String(o.name ?? o.title ?? o.id)]));
  const rows = items.map((r) => ({ ...r, conversation: conversationMap.get(String((r as any).conversation_id)) ?? "", sender: senderMap.get(String((r as any).sender_id)) ?? "" }));

  return (
    <div>
      <PageHeader title="Messages" description="Manage your messages" />

      <div className="mt-6">
        <DataTable<Message>
          title="Messages"
          singular="Message"
          columns={COLUMNS}
          rows={rows}
          loading={isLoading}
          searchKeys={SEARCH_KEYS}
          onNew={() => setDrawer({ open: true, record: null })}
          onEdit={(row) => setDrawer({ open: true, record: row })}
          onDelete={async (row) => {
            if (await confirm({ title: "Delete message", message: "This will delete this message. This action cannot be undone.", danger: true, confirmLabel: "Delete" })) del.mutate(String(row.id));
          }}
          onBulkDelete={async (rows) => {
            if (await confirm({ title: "Delete messages", message: "Delete " + rows.length + " message(s)? This cannot be undone.", danger: true, confirmLabel: "Delete" })) rows.forEach((r) => del.mutate(String(r.id)));
          }}
          onImport={(records) => records.forEach((rec) => create.mutate(rec))}
        />
      </div>

      <ResourceDrawer
        open={drawer.open}
        title={drawer.record ? "Edit Message" : "New Message"}
        description={drawer.record ? "Update this message" : "Create a new message"}
        onClose={closeDrawer}
      >
        <MessageForm
          record={drawer.record}
          submitting={create.isPending || update.isPending}
          submitLabel={drawer.record ? "Save changes" : "Create Message"}
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
