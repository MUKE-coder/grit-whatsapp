import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Participant, ParticipantInput } from "@/hooks/use-participants";
import { useConversations } from "@/hooks/use-conversations";
import { SearchableSelect } from "@/components/searchable-select";
import { useUsers } from "@/hooks/use-users";

const inputCls =
  "w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-[13px] text-foreground placeholder:text-foreground-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent";

interface ParticipantFormProps {
  // The typed resource, so passing the wrong record is a compile error rather
  // than a form that silently prefills nothing.
  record?: Participant | null;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: ParticipantInput) => void | Promise<void>;
  onCancel?: () => void;
}

export function ParticipantForm({ record, submitting, submitLabel, onSubmit, onCancel }: ParticipantFormProps) {
  const [conversationID, setConversationID] = useState<string>("");
  const [userID, setUserID] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [lastReadAt, setLastReadAt] = useState<string>("");
  const [lastDeliveredAt, setLastDeliveredAt] = useState<string>("");
  const [muted, setMuted] = useState<boolean>(false);
  const conversationsOpts = useConversations().data ?? [];
  const usersOpts = useUsers().data ?? [];

  useEffect(() => {
    if (!record) return;
      setConversationID(String(record.conversation_id ?? ""));
      setUserID(String(record.user_id ?? ""));
      setRole(String(record.role ?? ""));
      setLastReadAt(record.last_read_at ? String(record.last_read_at).slice(0, 16) : "");
      setLastDeliveredAt(record.last_delivered_at ? String(record.last_delivered_at).slice(0, 16) : "");
      setMuted(Boolean(record.muted));
  }, [record]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      conversation_id: conversationID,
      user_id: userID,
      role: role,
      last_read_at: lastReadAt,
      last_delivered_at: lastDeliveredAt,
      muted: muted,
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
          <label className="block text-[13px] font-medium text-foreground mb-1.5">User</label>
          <SearchableSelect value={userID} onChange={(v) => setUserID(v ?? "")} placeholder="Select user…"
            options={usersOpts.map((o: any) => ({ value: String(o.id), label: String(o.name ?? o.title ?? o.id) }))} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Role</label>
          <input type="text" value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Last Read At</label>
          <input type="datetime-local" value={lastReadAt} onChange={(e) => setLastReadAt(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Last Delivered At</label>
          <input type="datetime-local" value={lastDeliveredAt} onChange={(e) => setLastDeliveredAt(e.target.value)} className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="h-4 w-4" />
          Muted
        </label>
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
