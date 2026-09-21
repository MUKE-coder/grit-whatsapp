"use client";

import { ResourcePage } from "@/components/resource/resource-page";
import { messageResource } from "@/resources/messages/messages";

export default function MessagesPage() {
  return <ResourcePage resource={messageResource} />;
}
