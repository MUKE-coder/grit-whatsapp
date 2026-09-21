import { defineResource } from "@/lib/resource";
import custom from "./messages.custom";

export const messageResource = defineResource({
  name: "Message",
  slug: "messages",
  endpoint: "/api/messages",
  icon: "Mail",
  label: { singular: "Message", plural: "Messages" },
  table: {
    columns: [
      // grit:cols:auto-start
      { key: "conversation.name", label: "Conversation" },
      { key: "sender.name", label: "Sender" },
      { key: "body", label: "Body", searchable: true, onClick: "link" },
      { key: "kind", label: "Kind" },
      { key: "attachment", label: "Attachment", format: "file" },
      { key: "created_at", label: "Created", sortable: true, format: "relative" },
      // grit:cols:auto-end
    ],
    filters: [
    ],
    defaultSort: { key: "created_at", direction: "desc" },
    searchable: true,
    pageSize: 20,
    // Shown once rows are ticked. Drop "archive" here and the Archived tab
    // goes with it; the model keeps its archived_at either way.
    bulkActions: ["edit", "archive", "restore", "export", "delete"],
  },
  form: {
    fields: [
      // grit:fields:auto-start
    { key: "conversation_id", label: "Conversation", type: "relationship-select", required: true, relatedEndpoint: "/api/conversations", displayField: "name" },
    { key: "sender_id", label: "Sender", type: "relationship-select", required: true, relatedEndpoint: "/api/users", displayField: "name" },
    { key: "body", label: "Body", type: "textarea" },
    { key: "kind", label: "Kind", type: "select", required: true, options: [{ value: "text", label: "Text" }, { value: "image", label: "Image" }, { value: "file", label: "File" }] },
    { key: "attachment", label: "Attachment", type: "file", accepts: ["all"], maxSizeMB: 5 },
      // grit:fields:auto-end
    ],
  },
  dashboard: {
    widgets: [
      {
        type: "stat",
        label: "Total Messages",
        endpoint: "/api/messages",
        icon: "Mail",
        color: "accent",
      },
    ],
  },
}, custom);
