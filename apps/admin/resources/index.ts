import { usersResource } from "./users/users";
import { blogsResource } from "./blogs/blogs";
import { conversationResource } from "./conversations/conversations";
import { participantResource } from "./participants/participants";
import { messageResource } from "./messages/messages";
// grit:resources

import type { ResourceDefinition } from "@/lib/resource";

export const resources: ResourceDefinition[] = [
  usersResource,
  blogsResource,
  conversationResource,
  participantResource,
  messageResource,
  // grit:resource-list
];

export function getResource(slug: string): ResourceDefinition | undefined {
  return resources.find((r) => r.slug === slug);
}

export function getResourceByEndpoint(endpoint: string): ResourceDefinition | undefined {
  return resources.find((r) => r.endpoint === endpoint);
}
