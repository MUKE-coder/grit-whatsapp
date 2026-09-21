import { defineResource } from "@/lib/resource";
import custom from "./conversations.custom";

export const conversationResource = defineResource({
  name: "Conversation",
  slug: "conversations",
  endpoint: "/api/conversations",
  icon: "Database",
  label: { singular: "Conversation", plural: "Conversations" },
  table: {
    columns: [
      // grit:cols:auto-start
      { key: "title", label: "Title", sortable: true, searchable: true, onClick: "link" },
      { key: "is_group", label: "Is Group", format: "boolean" },
      { key: "last_message_at", label: "Last Message At", sortable: true, format: "relative" },
      { key: "last_message_preview", label: "Last Message Preview", sortable: true, searchable: true },
      { key: "created_at", label: "Created", sortable: true, format: "relative" },
      // grit:cols:auto-end
    ],
    filters: [
    { key: "is_group", label: "Is Group", type: "boolean" },
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
    { key: "title", label: "Title", type: "text", required: true },
    { key: "is_group", label: "Is Group", type: "toggle" },
    { key: "last_message_at", label: "Last Message At", type: "datetime" },
    { key: "last_message_preview", label: "Last Message Preview", type: "text", required: true },
      // grit:fields:auto-end
    ],
  },
  dashboard: {
    widgets: [
      {
        type: "stat",
        label: "Total Conversations",
        endpoint: "/api/conversations",
        icon: "Database",
        color: "accent",
      },
    ],
  },
}, custom);
