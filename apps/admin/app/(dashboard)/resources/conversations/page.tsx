"use client";

import { ResourcePage } from "@/components/resource/resource-page";
import { conversationResource } from "@/resources/conversations/conversations";

export default function ConversationsPage() {
  return <ResourcePage resource={conversationResource} />;
}
