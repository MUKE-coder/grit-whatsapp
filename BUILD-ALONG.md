# Build WhatsApp with Grit

This is the build, in the order it was done, from an empty folder to a messenger on the web, a phone and
the desktop. Every step says what to run or which file to write, shows the part of it that matters, and
says why. The finished code is in this repository; each step names the file, so you can copy it rather
than retype it.

You need Go 1.21+, Node 20+, pnpm 10.33.4 and the Grit CLI 3.301.0 or later (`grit update`).

What you end up with: sign-up, direct and group chats, messages that arrive live, typing indicators,
online status, sent, delivered and read ticks, unread counts, mute, photos, and push notifications, on
three clients sharing one API.

---

## 1. The project

```bash
grit new whatsapp --triple --next --expo --desktop --db sqlite
cd whatsapp
```

`--triple` is the API, a Next.js web app and an admin panel; `--expo` and `--desktop` add the phone and
desktop apps. SQLite means there is no database to install.

Two lines in `.env` let it run with nothing else installed: no Redis, and uploaded photos kept on disk.

```bash
REDIS_URL=
STORAGE_DRIVER=local
```

With Redis, realtime events reach every API process; without it they reach the one you are running,
which is all a laptop needs.

---

## 2. The data

Three resources. Generating them gets you the Go models, admin screens, CSV import and export, API docs
and a mobile and desktop screen for each, which is useful for looking at the data while you build.

```bash
grit generate resource Conversation --fields "title:string,is_group:bool,last_message_at:datetime,last_message_preview:string"
grit generate resource Participant --fields "conversation:belongs_to,user:belongs_to:User,role:select:member=Member|admin=Admin,last_read_at:datetime,last_delivered_at:datetime,muted:bool"
grit generate resource Message --fields "conversation:belongs_to,sender:belongs_to:User,body:text,kind:select:text=Text|image=Image|file=File,attachment:file"
grit migrate
```

- **Conversation** is a group (with a title) or a direct chat (without one).
- **Participant** is who is in which conversation, and how far each has got: `last_delivered_at` and
  `last_read_at`. Those two timestamps are the whole receipt system.
- **Message** is text, or a photo or file as a stored file reference.

One field the generator cannot know you want. Two people should have exactly one direct chat, however
many times, or however simultaneously, either starts it. In `apps/api/internal/models/conversation.go`:

```go
// DirectKey is "<smaller user id>:<larger user id>" on a direct chat and
// NULL on a group. Unique, so two people have exactly one direct chat.
DirectKey *string `gorm:"size:80;uniqueIndex" json:"-"`
```

It is a pointer so a group stores NULL, and a unique index allows any number of NULLs. While you are in
that file, take `binding:"required"` off `Title` and `LastMessagePreview`: a direct chat has neither.
Run `grit migrate` again.

---

## 3. The chat service

All of the logic lives in one file, `apps/api/internal/services/chat.go`. Four ideas carry it.

**Membership first, and not-a-member looks like not-found.** Every method starts by loading the caller's
participant row, and a missing one returns the same error as a conversation that does not exist, so a
conversation id never confirms that a conversation exists:

```go
var ErrNoSuchConversation = errors.New("conversation not found")

func (s *ChatService) membership(conversationID, userID string) (models.Participant, error) {
	var p models.Participant
	err := s.DB.Where("conversation_id = ? AND user_id = ?", conversationID, userID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return p, ErrNoSuchConversation
	}
	...
}
```

**The one direct chat.** `Direct` looks the pair up by `direct_key` and creates it if it is not there. If
both people start the chat at the same instant, the unique index lets one insert through, and the other
finds that one:

```go
if err != nil {
	// Both users started the chat at once: the unique direct_key lets one
	// insert through, and the other finds it.
	if again := s.DB.Where("direct_key = ?", key).First(&existing).Error; again == nil {
		return s.Conversation(existing.ID, callerID)
	}
	...
}
```

**Messages go to users, not channels.** `Send` saves the message, moves the conversation to the top of
the inbox and marks the sender as having read everything, in one transaction. Then it sends the message to
every member's open connections:

```go
s.Hub.SendToUsers(members, realtime.Event{Type: EventMessage, Payload: view})
```

Sending to users rather than to a conversation channel means a member's inbox updates whether or not that
chat is open, and the client has nothing to subscribe to.

**Receipts are two timestamps.** `Mark` sets `last_delivered_at` (and `last_read_at`, when reading) to now
and tells the members. A message I sent is read when every other member's `last_read_at` has passed its
time. Two writes per conversation, however many messages.

One trap, which cost an hour: take "now" from GORM's clock, not `time.Now().UTC()`.

```go
now := jsontime.DateTime{Time: s.DB.Config.NowFunc()}
```

SQLite compares times as text. GORM writes its own timestamps in local time, so a receipt written in UTC
sorted before a message written a second earlier in local time, and every message stayed unread. Postgres
compares instants and never shows it, which is exactly why it is worth knowing.

The tests for all of this are in `chat_test.go` next to it: outsiders get not-found for every read and
write, two people get one direct chat, paging never repeats or skips a message, muted members are not
notified, and one message after reading counts as exactly one unread. `go test ./internal/services/`.

---

## 4. The routes, and who may join which channel

`apps/api/internal/handlers/chat.go` is thin: parse, call the service, answer. The routes go in the
protected group in `apps/api/internal/routes/routes.go`:

```go
chat := protected.Group("/chat")
chat.GET("/users", chatHandler.Users)
chat.GET("/conversations", chatHandler.Conversations)
chat.POST("/conversations/direct", chatHandler.Direct)
chat.POST("/conversations/group", chatHandler.Group)
chat.GET("/conversations/:id", chatHandler.Conversation)
chat.GET("/conversations/:id/messages", chatHandler.Messages)
chat.POST("/conversations/:id/messages", chatHandler.Send)
chat.POST("/conversations/:id/delivered", chatHandler.Delivered)
chat.POST("/conversations/:id/read", chatHandler.Read)
chat.PUT("/conversations/:id/mute", chatHandler.Mute)
```

Then two channel rules, right after `realtime.AllowedOrigins = corsOrigins`. A private or presence channel
is refused unless a rule admits you:

```go
// Members only. Typing indicators travel on the private one as client events.
realtime.Channel("conversations.{id}", func(c realtime.ChannelContext) bool {
	return chatService.IsMember(c.Param("id"), c.UserID)
})
// Each user joins their own while the app is open; anyone they share a
// conversation with may join it to see them online.
realtime.Channel("users.{id}", func(c realtime.ChannelContext) bool {
	return chatService.SharesConversation(c.UserID, c.Param("id"))
})
```

That second rule is the whole of "online": you are online while you are in your own presence channel,
and only people you chat with may look.

---

## 5. The web app

The web client is four files in `apps/web`:

- `lib/chat-api.ts`: the routes, typed, and the tick rule.
- `hooks/use-chat.ts`: React Query for the data, and `useChatSync`, which applies realtime events to the
  cache.
- `components/chat/`: the inbox, the conversation and the composer.
- `app/(chat)/chat/page.tsx`: the page, with the open chat in `?c=`, so a reload keeps it.

Three things in them are worth reading closely.

**Optimistic sending.** A message appears at once as "sending" with a `client_id` of its own. The saved
message comes back with the same `client_id` and replaces it; a failure marks it "not sent" with a retry.

**Typing is a whisper.** The composer sends a client event on the conversation's private channel,
at most every three seconds while you type; the other side shows "typing…" for five seconds after the
last one, because a closed tab never says it stopped:

```ts
const whisper = useWhisper(`private-conversations.${conversationId}`);
whisper("typing", { on: true });
```

**One refresh at a time.** Access tokens last 15 minutes and a chat tab stays open for hours. The API
client answers a 401 by refreshing once and retrying, and requests failing together share that one
refresh, because the server treats a refresh token used twice as stolen and ends the session.

`/login` and `/register` are in `components/chat/auth-form.tsx`. Run it:

```bash
pnpm install
grit start
```

Open `http://localhost:3000/register` in two browsers, create two accounts, and chat.

---

## 6. Photos

`hooks/use-chat.ts` has `useSendImage`. The photo shows at once from a local preview, is shrunk in the
browser by `@repo/upload` before it leaves (a 102 KB PNG went up as a 12.5 KB JPEG), and goes out as an
image message pointing at the stored file. The composer's photo button calls it.

---

## 7. The phone

The Expo app is `apps/expo`: `lib/chat.ts` and `hooks/use-chat.ts` are the same API and cache logic as the
web, with the app's own HTTP client; the screens are `app/(tabs)/index.tsx` (the inbox, which replaces
the home tab), `app/chat/[id].tsx` and `app/chat/new.tsx`. `components/chat/chat-sync.tsx` runs the
realtime sync app-wide while you are signed in, and the chat screen tells it which chat is on screen.

Two differences from the web, both about the phone:

- The list is inverted, so the newest messages sit at the bottom and older ones load as you scroll up.
- "Read" means the chat is on screen and the app is in the foreground, from `AppState`.

To try it without a phone, `cd apps/expo && pnpm web` runs it in a browser; add `http://localhost:8081` to
`CORS_ORIGINS` for that.

---

## 8. Push notifications

```bash
grit plugin add push
grit migrate
pnpm install
```

The API sends through Expo's push service, which relays to Apple and Google, so there is no certificate or
Firebase key to manage. Connect it to the chat in `routes.go`:

```go
chatService.Notify = services.ChatPush(pushHandler.Push)
```

`services/chat_push.go` turns a new message into a notification for everyone but the sender and anyone
who muted the chat, with the conversation id in its data. In the app, `chat-sync.tsx` registers the
device after sign-in and opens the chat when a notification is tapped; `lib/auth.tsx` unregisters it
before signing out, while the session can still prove the token is yours.

Push needs a real phone: simulators and the web cannot receive it, and `registerForPush` returns `null`
there so the app carries on.

---

## 9. The desktop

The desktop app is a Vite and React app inside a native window, so the web chat's components carry over
nearly as they are. What changes: the API client (a bearer token from the OS keychain instead of a
cookie), the router (TanStack Router, `routes/app/chat.tsx`) and the theme's class names. Add a Chats entry
to `lib/nav-config.ts` and it sits in the sidebar with everything else.

```bash
cd apps/desktop && wails dev
```

Or, without Wails, `cd apps/desktop/frontend && pnpm dev` runs the same UI in a browser at
`http://localhost:5174`.

---

## What this does not do, and what WhatsApp does

See the table in `BLUEPRINT.md`. The short version: messages live on the server, not only on the phone;
they are not end-to-end encrypted; receipts are per member, not per device. Each of those is a real
difference, and each is a separate piece of work you would take on when your users need it, not before.

## What building it found in Grit

This build found a dozen bugs in Grit itself, from realtime being blocked in production web apps to
generated mobile and desktop screens that did not type-check, and a missing push feature. All of them are
fixed in Grit 3.297.0 to 3.301.0, and `BLUEPRINT.md` lists them.
