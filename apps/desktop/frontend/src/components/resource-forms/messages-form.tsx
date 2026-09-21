import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Message, MessageInput } from "@/hooks/use-messages";
import { useConversations } from "@/hooks/use-conversations";
import { SearchableSelect } from "@/components/searchable-select";
import { useUsers } from "@/hooks/use-users";
import { FileDropzone } from "@/components/file-dropzone";
import type { FileRef } from "@/lib/api-client";

const inputCls =
  "w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-[13px] text-foreground placeholder:text-foreground-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent";

interface MessageFormProps {
  // The typed resource, so passing the wrong record is a compile error rather
  // than a form that silently prefills nothing.
  record?: Message | null;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: MessageInput) => void | Promise<void>;
  onCancel?: () => void;
}

export function MessageForm({ record, submitting, submitLabel, onSubmit, onCancel }: MessageFormProps) {
  const [conversationID, setConversationID] = useState<string>("");
  const [senderID, setSenderID] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [attachment, setAttachment] = useState<FileRef | null>(null);
  const conversationsOpts = useConversations().data ?? [];
  const usersOpts = useUsers().data ?? [];

  useEffect(() => {
    if (!record) return;
      setConversationID(String(record.conversation_id ?? ""));
      setSenderID(String(record.sender_id ?? ""));
      setBody(String(record.body ?? ""));
      setKind(String(record.kind ?? ""));
      setAttachment((record.attachment as FileRef | null) ?? null);
  }, [record]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      conversation_id: conversationID,
      sender_id: senderID,
      body: body,
      kind: kind,
      attachment: attachment,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="flex-1 space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Conversation</label>
          <SearchableSelect value={conversationID} onChange={(v) => setConversationID(v ?? "")} placeholder="Select conversation…"
            options={conversationsOpts.map((o: any) => ({ value: String(o.id), label: String(o.name ?? o.title ?? o.id) }))} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Sender</label>
          <SearchableSelect value={senderID} onChange={(v) => setSenderID(v ?? "")} placeholder="Select sender…"
            options={usersOpts.map((o: any) => ({ value: String(o.id), label: String(o.name ?? o.title ?? o.id) }))} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Kind</label>
          <input type="text" value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls} />
        </div>
        <FileDropzone label="Attachment" value={attachment} onChange={(v) => setAttachment((v as FileRef) ?? null)} />
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
