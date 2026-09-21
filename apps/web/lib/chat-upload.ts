// Image and file uploads for chat messages: shrunk in the browser, then sent to
// storage by @repo/upload, with the same cookie session as every other call.
import { createAxiosTransport, createUploader, type FileRef } from "@repo/upload";
import { optimizeImage } from "@repo/upload/web";
import { api } from "@/lib/api";
import type { Attachment } from "@/lib/chat-api";

export const uploader = createUploader({
  transport: createAxiosTransport(api, "/api"),
  optimize: optimizeImage,
});

export function toAttachment(ref: FileRef): Attachment {
  return {
    url: ref.url,
    key: ref.key,
    name: ref.name,
    mime: ref.mime,
    size: ref.size,
    width: ref.width,
    height: ref.height,
  };
}
