"use client";

import { use } from "react";
import { ResourceDetailPage } from "@/components/resource/resource-detail-page";
import { conversationResource } from "@/resources/conversations/conversations";

export default function ConversationsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ResourceDetailPage resource={conversationResource} id={id} />;
}
