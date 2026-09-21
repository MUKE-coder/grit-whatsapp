"use client";

import { ArrowLeft, BellOff, LogOut, MessageSquarePlus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Avatar, shortTime } from "@/components/chat/bits";
import { useConversations, useCreateGroup, useOnline, useStartDirect, useUserSearch } from "@/hooks/use-chat";
import {
  type ChatUser,
  type Conversation,
  conversationTitle,
  displayName,
  type Me,
  otherMember,
} from "@/lib/chat-api";
import { getApiErrorMessage } from "@/lib/api-core";
import { cn } from "@/lib/utils";

type View = "inbox" | "new-chat" | "new-group";

export function Sidebar({
  me,
  activeId,
  onOpen,
  onSignOut,
}: {
  me: Me;
  activeId: string | null;
  onOpen: (id: string) => void;
  onSignOut: () => void;
}) {
  const [view, setView] = useState<View>("inbox");
  return (
    <aside className="flex h-full min-h-0 flex-col border-border border-r bg-bg-secondary">
      {view === "inbox" && (
        <Inbox me={me} activeId={activeId} onOpen={onOpen} onNew={setView} onSignOut={onSignOut} />
      )}
      {view === "new-chat" && (
        <NewChat
          onBack={() => setView("inbox")}
          onStarted={(id) => {
            setView("inbox");
            onOpen(id);
          }}
        />
      )}
      {view === "new-group" && (
        <NewGroup
          onBack={() => setView("inbox")}
          onCreated={(id) => {
            setView("inbox");
            onOpen(id);
          }}
        />
      )}
    </aside>
  );
}

function Inbox({
  me,
  activeId,
  onOpen,
  onNew,
  onSignOut,
}: {
  me: Me;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: (v: View) => void;
  onSignOut: () => void;
}) {
  const { data, isLoading, isError } = useConversations();
  const [filter, setFilter] = useState("");
  const term = filter.trim().toLowerCase();
  const rows = (data ?? []).filter((c) => !term || conversationTitle(c, me.id).toLowerCase().includes(term));

  return (
    <>
      <header className="flex items-center gap-3 border-border border-b px-4 py-3">
        <Avatar id={me.id} name={displayName(me)} src={me.avatar} size="sm" />
        <h1 className="flex-1 font-semibold text-foreground">Chats</h1>
        <IconButton label="New group" onClick={() => onNew("new-group")}>
          <Users className="h-5 w-5" aria-hidden />
        </IconButton>
        <IconButton label="New chat" onClick={() => onNew("new-chat")}>
          <MessageSquarePlus className="h-5 w-5" aria-hidden />
        </IconButton>
        <IconButton label="Sign out" onClick={onSignOut}>
          <LogOut className="h-5 w-5" aria-hidden />
        </IconButton>
      </header>
      <SearchBox value={filter} onChange={setFilter} placeholder="Search chats" />
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <li className="px-4 py-6 text-sm text-text-muted">Loading chats…</li>}
        {isError && <li className="px-4 py-6 text-danger text-sm">Could not load your chats.</li>}
        {!isLoading && rows.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-text-muted">
            {term ? "No chats match." : "No chats yet. Start one with the new chat button."}
          </li>
        )}
        {rows.map((c) => (
          <InboxRow key={c.id} conv={c} meId={me.id} active={c.id === activeId} onOpen={onOpen} />
        ))}
      </ul>
    </>
  );
}

function InboxRow({
  conv,
  meId,
  active,
  onOpen,
}: {
  conv: Conversation;
  meId: string;
  active: boolean;
  onOpen: (id: string) => void;
}) {
  const other = otherMember(conv, meId);
  const online = useOnline(other?.id);
  const title = conversationTitle(conv, meId);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(conv.id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover",
          active && "bg-bg-tertiary",
        )}
      >
        <Avatar id={other?.id ?? conv.id} name={title} src={other?.avatar} online={online} />
        <span className="min-w-0 flex-1 border-border border-b pb-3">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
            <span className={cn("shrink-0 text-xs", conv.unread > 0 ? "text-success" : "text-text-muted")}>
              {shortTime(conv.last_message_at)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
              {conv.last_message_preview || (conv.is_group ? "Group created" : "Say hello")}
            </span>
            {conv.muted && <BellOff className="h-4 w-4 shrink-0 text-text-muted" aria-label="Muted" />}
            {conv.unread > 0 && (
              <span className="min-w-5 shrink-0 rounded-full bg-success px-1.5 text-center font-semibold text-white text-xs leading-5">
                {conv.unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function NewChat({ onBack, onStarted }: { onBack: () => void; onStarted: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const users = useUserSearch(search.trim(), true);
  const start = useStartDirect();
  return (
    <>
      <PanelHeader title="New chat" onBack={onBack} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search people by name or email" autoFocus />
      {start.isError && (
        <p className="px-4 py-2 text-danger text-sm">{getApiErrorMessage(start.error, "Could not start that chat.")}</p>
      )}
      <PeopleList
        users={users.data}
        loading={users.isLoading}
        onPick={(u) => start.mutate(u.id, { onSuccess: (conv) => onStarted(conv.id) })}
      />
    </>
  );
}

function NewGroup({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<ChatUser[]>([]);
  const users = useUserSearch(search.trim(), true);
  const create = useCreateGroup();
  const toggle = (u: ChatUser) =>
    setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));

  return (
    <>
      <PanelHeader title="New group" onBack={onBack} />
      <form
        className="flex flex-col gap-3 border-border border-b px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { title, memberIds: picked.map((u) => u.id) },
            { onSuccess: (conv) => onCreated(conv.id) },
          );
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">Group name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </label>
        {picked.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Members">
            {picked.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  className="rounded-full bg-bg-tertiary px-3 py-1 text-foreground text-sm hover:bg-bg-hover"
                >
                  {displayName(u)} <span aria-hidden>×</span>
                  <span className="sr-only">(remove)</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {create.isError && (
          <p className="text-danger text-sm">{getApiErrorMessage(create.error, "Could not create the group.")}</p>
        )}
        <button
          type="submit"
          disabled={!title.trim() || picked.length === 0 || create.isPending}
          className="rounded-md bg-accent px-3 py-2 font-medium text-sm text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : `Create group (${picked.length + 1})`}
        </button>
      </form>
      <SearchBox value={search} onChange={setSearch} placeholder="Add people" />
      <PeopleList
        users={users.data}
        loading={users.isLoading}
        selected={new Set(picked.map((u) => u.id))}
        onPick={toggle}
      />
    </>
  );
}

function PeopleList({
  users,
  loading,
  selected,
  onPick,
}: {
  users: ChatUser[] | undefined;
  loading: boolean;
  selected?: Set<string>;
  onPick: (u: ChatUser) => void;
}) {
  if (loading) return <p className="px-4 py-6 text-sm text-text-muted">Searching…</p>;
  if (!users || users.length === 0) return <p className="px-4 py-6 text-sm text-text-muted">Nobody found.</p>;
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {users.map((u) => (
        <li key={u.id}>
          <button
            type="button"
            onClick={() => onPick(u)}
            aria-pressed={selected ? selected.has(u.id) : undefined}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-hover",
              selected?.has(u.id) && "bg-bg-tertiary",
            )}
          >
            <Avatar id={u.id} name={displayName(u)} src={u.avatar} />
            <span className="font-medium text-foreground">{displayName(u)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 border-border border-b px-4 py-3">
      <IconButton label="Back to chats" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </IconButton>
      <h1 className="font-semibold text-foreground">{title}</h1>
    </header>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="px-3 py-2">
      <label className="flex items-center gap-2 rounded-lg bg-bg-tertiary px-3 py-2">
        <Search className="h-4 w-4 text-text-muted" aria-hidden />
        <span className="sr-only">{placeholder}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-foreground text-sm outline-none placeholder:text-text-muted"
        />
      </label>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-full p-2 text-text-secondary hover:bg-bg-hover hover:text-foreground"
    >
      {children}
    </button>
  );
}
