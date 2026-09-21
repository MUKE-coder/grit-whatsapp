import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Conversation, ConversationInput } from "@/hooks/use-conversations";

const inputCls =
  "w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-[13px] text-foreground placeholder:text-foreground-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent";

interface ConversationFormProps {
  // The typed resource, so passing the wrong record is a compile error rather
  // than a form that silently prefills nothing.
  record?: Conversation | null;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: ConversationInput) => void | Promise<void>;
  onCancel?: () => void;
}

export function ConversationForm({ record, submitting, submitLabel, onSubmit, onCancel }: ConversationFormProps) {
  const [title, setTitle] = useState<string>("");
  const [isGroup, setIsGroup] = useState<boolean>(false);
  const [lastMessageAt, setLastMessageAt] = useState<string>("");
  const [lastMessagePreview, setLastMessagePreview] = useState<string>("");

  useEffect(() => {
    if (!record) return;
      setTitle(String(record.title ?? ""));
      setIsGroup(Boolean(record.is_group));
      setLastMessageAt(record.last_message_at ? String(record.last_message_at).slice(0, 16) : "");
      setLastMessagePreview(String(record.last_message_preview ?? ""));
  }, [record]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      title: title,
      is_group: isGroup,
      last_message_at: lastMessageAt,
      last_message_preview: lastMessagePreview,
    } as ConversationInput);
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="flex-1 space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} className="h-4 w-4" />
          Is Group
        </label>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Last Message At</label>
          <input type="datetime-local" value={lastMessageAt} onChange={(e) => setLastMessageAt(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Last Message Preview</label>
          <input type="text" value={lastMessagePreview} onChange={(e) => setLastMessagePreview(e.target.value)} className={inputCls} />
        </div>
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
