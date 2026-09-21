# WhatsApp, built with Grit

A working WhatsApp-style messenger: one Go API, one realtime hub, and clients on the web, mobile and
desktop. Not a chat component. The whole thing: accounts, direct and group chats, live delivery, typing
indicators, online status, read receipts, unread counts and mute.

This is the first Grit UI blueprint. Every blueprint is a real Grit project you can run, read and take
pieces from.

## Status

| Part | State |
|---|---|
| API: conversations, messages, receipts, mute, realtime delivery | Done, tested (8 service tests, a live REST and WebSocket run) |
| Web app (`apps/web`): sign in, inbox, chat, typing, online, ticks | Done, tested in a browser against a live second user |
| Photos in messages | Done: shrunk in the browser before upload (a 102 KB PNG went out as a 12.5 KB JPEG), shown at once from a local preview |
| Mobile (`apps/expo`) | Next |
| Desktop (`apps/desktop`) | After mobile |
| Push notifications for offline members | With mobile (the `Notify` hook is in place) |

## Run it

You need Go 1.21+, Node 20+, pnpm 10.33.4 and the Grit CLI 3.298.0 or later (`grit update`). No Docker:
it runs on SQLite, keeps uploaded photos on local disk, and does without Redis.

```bash
grit env        # .env from .env.example, with every secret generated
pnpm install
grit migrate
grit seed
grit start
```

Checked from a fresh clone: `grit env` generated the 10 secrets, and migrate, seed and the API all started.

Open http://localhost:3000/register in two browsers (or a normal and a private window), create two
accounts, and start a chat from the new chat button.

## How it works

### The data

Three tables, generated with `grit generate resource`, so they also get admin screens, CSV import and
export, and API docs for free:

- `conversations`: a group has a title; a direct chat has a `direct_key`, the two user ids sorted and
  joined. It is unique, so two people have exactly one direct chat however many times, or however
  simultaneously, either of them starts it.
- `participants`: who is in which conversation, and how far each has got: `last_delivered_at` and
  `last_read_at`.
- `messages`: text, or an image or file as a stored file reference.

### The API

`apps/api/internal/services/chat.go` holds all of it. Every read and write checks membership first, and
"not a member" answers exactly like "does not exist", so a conversation id never confirms that a
conversation exists.

| Route | What it does |
|---|---|
| `GET /api/v1/chat/users?search=` | People to message. Names and avatars only, never emails |
| `GET /api/v1/chat/conversations` | The inbox, newest activity first, with unread counts |
| `POST /api/v1/chat/conversations/direct` | Find or start the one direct chat with someone |
| `POST /api/v1/chat/conversations/group` | Create a group; you are its admin |
| `GET /api/v1/chat/conversations/:id/messages?before=` | Older messages, 50 at a time |
| `POST /api/v1/chat/conversations/:id/messages` | Send |
| `POST /api/v1/chat/conversations/:id/delivered` and `/read` | Receipts |
| `PUT /api/v1/chat/conversations/:id/mute` | Mute or unmute, for you |

### Live updates

Three realtime mechanisms, each used for what it is good at:

1. **Messages and receipts go to users, not channels.** When a message is saved, the API sends it to every
   member's open connections with `hub.SendToUsers`. A member's inbox updates whether or not that chat is
   open, and there is nothing to subscribe to.
2. **Typing goes over a private channel as a client event.** `private-conversations.<id>` admits members
   only (the authorizer in `routes.go`). A typing browser whispers `typing` on it; the server relays it to
   the other members and stores nothing.
3. **Online status is a presence channel per user.** Each user joins `presence-users.<their id>` while the
   app is open. Anyone they share a conversation with may join it too, and "online" means the owner is
   among its members. Nobody can watch the status of a stranger.

### Ticks

Receipts are two timestamps per member, not a row per message. A message I sent is:

- **sent** once saved,
- **delivered** when every other member's `last_delivered_at` has passed its time,
- **read** when every other member's `last_read_at` has.

A device marks a conversation delivered when a message reaches it, and read when that conversation is open
and the tab is visible. Two writes per conversation, however many messages, and the ticks for a thousand
old messages are computed, not stored.

### Sending, and when it fails

The web client adds a message to the screen at once as "sending", with an id of its own (`client_id`). The
saved message comes back with the same `client_id` and replaces it. If the request fails, the message is
marked "not sent" with a retry button.

### Staying signed in

Access tokens last 15 minutes. The chat's API client answers a 401 by refreshing once and retrying, and ten
requests failing together share one refresh, because the server treats a reused refresh token as theft.

## What WhatsApp does at scale, and what this does instead

| Concern | WhatsApp | This blueprint | Where the difference starts to matter |
|---|---|---|---|
| Message storage | Messages live on the phone; the server holds them only until delivered | Messages live in the database | Storage cost at hundreds of millions of messages a day. Until then, server-side history is a feature (search, new devices, the web app) |
| Encryption | End to end (Signal protocol); the server cannot read messages | TLS in transit; the server can read messages | The moment your users need the server to be unable to read them. It is a large, separate piece of work: key distribution, multi-device, and no server-side search |
| Fan-out | Custom Erlang servers, millions of connections each | One Go hub per API process, with Redis carrying events between processes | Tens of thousands of concurrent connections per process. Add processes behind a load balancer before rewriting anything |
| Receipts | Per message, per device | Per member, two timestamps | Per-message "read by" lists in large groups; add a receipts table then |
| Presence | Last seen, with privacy settings | Online now, visible only to people you share a chat with | Add a `last_seen_at` written when a user's last connection closes |

## Found while building this

Building a blueprint is also a test of Grit. This one found:

- **Realtime was blocked in production.** The Next.js CSP named the API as `http(s)://` in `connect-src`,
  which does not admit the `ws(s)://` socket on the same host. Development hid it. Fixed in Grit v3.297.0.
- `grit generate resource` left `apidocs.go` not gofmt-clean (a trailing comma before a marker comment).
- A `--triple` project's web app has empty sign-in folders and no sign-in pages.
- `*.tsbuildinfo` and `next-env.d.ts` were not ignored. Fixed in Grit v3.297.0.
- A cloned Grit project could not start: `.env` is not committed, `.env.example` has `CHANGE_ME` for
  every secret, and nothing generated them. `grit env` does, from Grit v3.298.0.
- `jsontime.DateTime` marshals to whole seconds, too coarse for read ticks; this blueprint's DTOs use
  `time.Time`.
- On SQLite, times are compared as text. GORM stores its own timestamps in local time, so a value
  written as `time.Now().UTC()` sorts wrongly against them: every message stayed unread until receipts
  took their time from GORM's clock (`db.Config.NowFunc()`). Postgres compares instants and never
  showed it.
