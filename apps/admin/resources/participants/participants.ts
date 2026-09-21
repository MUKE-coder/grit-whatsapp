import { defineResource } from "@/lib/resource";
import custom from "./participants.custom";

export const participantResource = defineResource({
  name: "Participant",
  slug: "participants",
  endpoint: "/api/participants",
  icon: "Database",
  label: { singular: "Participant", plural: "Participants" },
  table: {
    columns: [
      // grit:cols:auto-start
      { key: "conversation.name", label: "Conversation" },
      { key: "user.name", label: "User" },
      { key: "role", label: "Role", onClick: "link" },
      { key: "last_read_at", label: "Last Read At", sortable: true, format: "relative" },
      { key: "last_delivered_at", label: "Last Delivered At", sortable: true, format: "relative" },
      { key: "muted", label: "Muted", format: "boolean" },
      { key: "created_at", label: "Created", sortable: true, format: "relative" },
      // grit:cols:auto-end
    ],
    filters: [
    { key: "muted", label: "Muted", type: "boolean" },
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
    { key: "user_id", label: "User", type: "relationship-select", required: true, relatedEndpoint: "/api/users", displayField: "name" },
    { key: "role", label: "Role", type: "select", required: true, options: [{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }] },
    { key: "last_read_at", label: "Last Read At", type: "datetime" },
    { key: "last_delivered_at", label: "Last Delivered At", type: "datetime" },
    { key: "muted", label: "Muted", type: "toggle" },
      // grit:fields:auto-end
    ],
  },
  dashboard: {
    widgets: [
      {
        type: "stat",
        label: "Total Participants",
        endpoint: "/api/participants",
        icon: "Database",
        color: "accent",
      },
    ],
  },
}, custom);
