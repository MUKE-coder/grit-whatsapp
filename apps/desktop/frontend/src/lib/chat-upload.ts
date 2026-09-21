// Photos for chat messages, through the desktop's upload endpoint.
import { type FileRef, uploadFile } from "@/lib/api-client";
import type { Attachment } from "@/lib/chat-api";

export const uploader = {
  upload: (file: File, _name: string) => uploadFile(file),
};

export function toAttachment(ref: FileRef): Attachment {
  return { url: ref.url, key: ref.key ?? "", name: ref.name, mime: ref.mime ?? "", size: ref.size ?? 0 };
}
