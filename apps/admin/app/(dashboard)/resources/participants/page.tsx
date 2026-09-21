"use client";

import { ResourcePage } from "@/components/resource/resource-page";
import { participantResource } from "@/resources/participants/participants";

export default function ParticipantsPage() {
  return <ResourcePage resource={participantResource} />;
}
