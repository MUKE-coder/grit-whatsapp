package services

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"

	"whatsapp/apps/api/internal/files"
	"whatsapp/apps/api/internal/jsontime"
	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/realtime"
	"whatsapp/apps/api/internal/respond"
)

// ChatService is the messaging core: conversations, messages and receipts.
//
// Every read and write is scoped to a conversation the caller belongs to, and
// "not a member" answers exactly like "does not exist", so a conversation id
// never confirms that a conversation exists.
//
// Delivery is by user, not by channel: a new message or receipt is sent to every
// member's open connections with SendToUsers, so a member's inbox updates
// whether or not that conversation is open. Typing indicators are client events
// on private-conversations.<id>, which the channel authorizer in routes.go
// limits to members.
type ChatService struct {
	DB  *gorm.DB
	Hub *realtime.Hub
	// Notify, when set, is called after a message is saved with the members
	// who should hear about it: everyone but the sender, minus anyone who muted
	// the conversation. It is where push notifications go.
	Notify func(recipients []string, msg MessageView, from ChatUser)
}

// ErrNoSuchConversation covers both "does not exist" and "you are not in it".
var ErrNoSuchConversation = errors.New("conversation not found")

// MaxMessageLength bounds a message body, in characters.
const MaxMessageLength = 4000

// ChatUser is the public face of a user inside the chat: no email, no role.
type ChatUser struct {
	ID        string `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Avatar    string `json:"avatar"`
}

// MemberView is a member and how far they have read.
type MemberView struct {
	ChatUser
	Role            string     `json:"role"`
	LastReadAt      *time.Time `json:"last_read_at"`
	LastDeliveredAt *time.Time `json:"last_delivered_at"`
}

// ConversationView is one row of the inbox.
type ConversationView struct {
	ID                 string       `json:"id"`
	Title              string       `json:"title"`
	IsGroup            bool         `json:"is_group"`
	LastMessageAt      *time.Time   `json:"last_message_at"`
	LastMessagePreview string       `json:"last_message_preview"`
	Unread             int64        `json:"unread"`
	Muted              bool         `json:"muted"`
	Members            []MemberView `json:"members"`
}

// MessageView is a message as clients see it. Times keep full precision,
// because read ticks compare a member's last_read_at with created_at.
type MessageView struct {
	ID             string         `json:"id"`
	ConversationID string         `json:"conversation_id"`
	SenderID       string         `json:"sender_id"`
	Body           string         `json:"body"`
	Kind           string         `json:"kind"`
	Attachment     *files.FileRef `json:"attachment"`
	ClientID       string         `json:"client_id,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
}

// Receipt says a member has received or read everything up to a time.
type Receipt struct {
	ConversationID  string     `json:"conversation_id"`
	UserID          string     `json:"user_id"`
	LastReadAt      *time.Time `json:"last_read_at"`
	LastDeliveredAt *time.Time `json:"last_delivered_at"`
}

// SendInput is a new message. ClientID is the sender's own id for it, echoed
// back so the sender can match the saved message to its optimistic copy.
type SendInput struct {
	Body       string         `json:"body"`
	Kind       string         `json:"kind"`
	Attachment *files.FileRef `json:"attachment"`
	ClientID   string         `json:"client_id"`
}

// Realtime event types.
const (
	EventMessage      = "chat.message"
	EventReceipt      = "chat.receipt"
	EventConversation = "chat.conversation"
)

func toChatUser(u models.User) ChatUser {
	return ChatUser{ID: u.ID, FirstName: u.FirstName, LastName: u.LastName, Avatar: u.Avatar}
}

func toMessageView(m models.Message, clientID string) MessageView {
	return MessageView{
		ID: m.ID, ConversationID: m.ConversationID, SenderID: m.SenderID, Body: m.Body,
		Kind: m.Kind, Attachment: m.Attachment, ClientID: clientID, CreatedAt: m.CreatedAt,
	}
}

func timeOf(d *jsontime.DateTime) *time.Time {
	if d == nil || d.IsZero() {
		return nil
	}
	t := d.Time
	return &t
}

// Users lists the people the caller can start a chat with, by name or email.
func (s *ChatService) Users(callerID, search string, limit int) ([]ChatUser, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	q := s.DB.Model(&models.User{}).Where("id <> ? AND active = ?", callerID, true)
	if term := strings.TrimSpace(strings.ToLower(search)); term != "" {
		like := "%" + term + "%"
		q = q.Where("LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(email) LIKE ?", like, like, like)
	}
	var users []models.User
	if err := q.Order("first_name, last_name").Limit(limit).Find(&users).Error; err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	out := make([]ChatUser, 0, len(users))
	for _, u := range users {
		out = append(out, toChatUser(u))
	}
	return out, nil
}

// membership loads the caller's participant row, or ErrNoSuchConversation.
func (s *ChatService) membership(conversationID, userID string) (models.Participant, error) {
	var p models.Participant
	err := s.DB.Where("conversation_id = ? AND user_id = ?", conversationID, userID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return p, ErrNoSuchConversation
	}
	if err != nil {
		return p, fmt.Errorf("checking membership: %w", err)
	}
	return p, nil
}

// IsMember reports whether userID belongs to the conversation. The realtime
// channel authorizer uses it.
func (s *ChatService) IsMember(conversationID, userID string) bool {
	_, err := s.membership(conversationID, userID)
	return err == nil
}

// SharesConversation reports whether two users are in any conversation
// together, which is what lets one see the other's online status.
func (s *ChatService) SharesConversation(a, b string) bool {
	if a == b {
		return true
	}
	var n int64
	err := s.DB.Model(&models.Participant{}).
		Where("user_id = ? AND conversation_id IN (?)", b,
			s.DB.Model(&models.Participant{}).Select("conversation_id").Where("user_id = ?", a)).
		Count(&n).Error
	return err == nil && n > 0
}

// memberIDs lists everyone in a conversation.
func (s *ChatService) memberIDs(conversationID string) ([]string, error) {
	var ids []string
	if err := s.DB.Model(&models.Participant{}).Where("conversation_id = ?", conversationID).
		Pluck("user_id", &ids).Error; err != nil {
		return nil, fmt.Errorf("listing members: %w", err)
	}
	return ids, nil
}

// Conversations is the caller's inbox, most recent activity first.
func (s *ChatService) Conversations(userID string) ([]ConversationView, error) {
	var mine []models.Participant
	if err := s.DB.Where("user_id = ?", userID).Find(&mine).Error; err != nil {
		return nil, fmt.Errorf("listing conversations: %w", err)
	}
	if len(mine) == 0 {
		return []ConversationView{}, nil
	}
	ids := make([]string, 0, len(mine))
	for _, p := range mine {
		ids = append(ids, p.ConversationID)
	}
	return s.views(userID, ids)
}

// Conversation is one inbox row, for a caller who belongs to it.
func (s *ChatService) Conversation(conversationID, userID string) (ConversationView, error) {
	if _, err := s.membership(conversationID, userID); err != nil {
		return ConversationView{}, err
	}
	views, err := s.views(userID, []string{conversationID})
	if err != nil {
		return ConversationView{}, err
	}
	if len(views) == 0 {
		return ConversationView{}, ErrNoSuchConversation
	}
	return views[0], nil
}

// views builds inbox rows for conversations the caller belongs to: three
// queries however many conversations, plus one count per conversation that has
// unread messages.
func (s *ChatService) views(userID string, ids []string) ([]ConversationView, error) {
	var convs []models.Conversation
	if err := s.DB.Where("id IN ?", ids).Find(&convs).Error; err != nil {
		return nil, fmt.Errorf("loading conversations: %w", err)
	}
	var members []models.Participant
	if err := s.DB.Preload("User").Where("conversation_id IN ?", ids).Find(&members).Error; err != nil {
		return nil, fmt.Errorf("loading members: %w", err)
	}
	byConv := map[string][]models.Participant{}
	for _, m := range members {
		byConv[m.ConversationID] = append(byConv[m.ConversationID], m)
	}

	out := make([]ConversationView, 0, len(convs))
	for _, c := range convs {
		view := ConversationView{
			ID: c.ID, Title: c.Title, IsGroup: c.IsGroup,
			LastMessageAt: timeOf(c.LastMessageAt), LastMessagePreview: c.LastMessagePreview,
			Members: []MemberView{},
		}
		var myReadAt *time.Time
		for _, m := range byConv[c.ID] {
			if m.User == nil {
				continue
			}
			view.Members = append(view.Members, MemberView{
				ChatUser: toChatUser(*m.User), Role: m.Role,
				LastReadAt: timeOf(m.LastReadAt), LastDeliveredAt: timeOf(m.LastDeliveredAt),
			})
			if m.UserID == userID {
				myReadAt = timeOf(m.LastReadAt)
				view.Muted = m.Muted
			}
		}
		if view.LastMessageAt != nil && (myReadAt == nil || view.LastMessageAt.After(*myReadAt)) {
			q := s.DB.Model(&models.Message{}).Where("conversation_id = ? AND sender_id <> ?", c.ID, userID)
			if myReadAt != nil {
				q = q.Where("created_at > ?", *myReadAt)
			}
			if err := q.Count(&view.Unread).Error; err != nil {
				return nil, fmt.Errorf("counting unread: %w", err)
			}
		}
		out = append(out, view)
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i].LastMessageAt, out[j].LastMessageAt
		switch {
		case a == nil && b == nil:
			return out[i].ID < out[j].ID
		case a == nil:
			return false
		case b == nil:
			return true
		}
		return a.After(*b)
	})
	return out, nil
}

// directKey names the one direct conversation two users share, whichever of
// them starts it.
func directKey(a, b string) string {
	pair := []string{a, b}
	sort.Strings(pair)
	return pair[0] + ":" + pair[1]
}

// Direct finds or creates the one-to-one conversation between the caller and
// another user.
func (s *ChatService) Direct(callerID, otherID string) (ConversationView, error) {
	if otherID == "" || otherID == callerID {
		return ConversationView{}, respond.Rule("Choose someone else to message")
	}
	var other models.User
	if err := s.DB.Where("id = ? AND active = ?", otherID, true).First(&other).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ConversationView{}, respond.Rule("That user does not exist")
		}
		return ConversationView{}, fmt.Errorf("loading user: %w", err)
	}
	key := directKey(callerID, otherID)

	var existing models.Conversation
	err := s.DB.Where("direct_key = ?", key).First(&existing).Error
	if err == nil {
		return s.Conversation(existing.ID, callerID)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ConversationView{}, fmt.Errorf("finding conversation: %w", err)
	}

	conv := models.Conversation{DirectKey: &key}
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&conv).Error; err != nil {
			return err
		}
		return tx.Create(&[]models.Participant{
			{ConversationID: conv.ID, UserID: callerID, Role: "member"},
			{ConversationID: conv.ID, UserID: otherID, Role: "member"},
		}).Error
	})
	if err != nil {
		// Both users started the chat at once: the unique direct_key lets one
		// insert through, and the other finds it.
		if again := s.DB.Where("direct_key = ?", key).First(&existing).Error; again == nil {
			return s.Conversation(existing.ID, callerID)
		}
		return ConversationView{}, fmt.Errorf("creating conversation: %w", err)
	}
	return s.Conversation(conv.ID, callerID)
}

// Group creates a group with the caller as its admin.
func (s *ChatService) Group(callerID, title string, memberIDs []string) (ConversationView, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return ConversationView{}, respond.Rule("A group needs a name")
	}
	if utf8.RuneCountInString(title) > 100 {
		return ConversationView{}, respond.Rule("A group name is at most 100 characters")
	}
	seen := map[string]bool{callerID: true}
	var others []string
	for _, id := range memberIDs {
		if id != "" && !seen[id] {
			seen[id] = true
			others = append(others, id)
		}
	}
	if len(others) == 0 {
		return ConversationView{}, respond.Rule("Add at least one other person")
	}
	if len(others) > 255 {
		return ConversationView{}, respond.Rule("A group has at most 256 members")
	}
	var found int64
	if err := s.DB.Model(&models.User{}).Where("id IN ? AND active = ?", others, true).Count(&found).Error; err != nil {
		return ConversationView{}, fmt.Errorf("checking members: %w", err)
	}
	if int(found) != len(others) {
		return ConversationView{}, respond.Rule("Some of those people do not exist")
	}

	conv := models.Conversation{Title: title, IsGroup: true}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&conv).Error; err != nil {
			return err
		}
		rows := []models.Participant{{ConversationID: conv.ID, UserID: callerID, Role: "admin"}}
		for _, id := range others {
			rows = append(rows, models.Participant{ConversationID: conv.ID, UserID: id, Role: "member"})
		}
		return tx.Create(&rows).Error
	})
	if err != nil {
		return ConversationView{}, fmt.Errorf("creating group: %w", err)
	}
	view, err := s.Conversation(conv.ID, callerID)
	if err != nil {
		return view, err
	}
	// Everyone added sees the group appear without reloading.
	s.Hub.SendToUsers(append(others, callerID), realtime.Event{Type: EventConversation, Payload: conversationPing{ID: conv.ID}})
	return view, nil
}

// conversationPing tells a client to refetch one inbox row. The row is
// per viewer (unread counts, mute), so it is not sent itself.
type conversationPing struct {
	ID string `json:"id"`
}

// Messages pages backwards through a conversation: the newest first, and
// before=<id> for the page older than that message. Keyset on (created_at,
// id), so a page costs the same however far back it is.
func (s *ChatService) Messages(conversationID, userID, before string, limit int) ([]MessageView, error) {
	if _, err := s.membership(conversationID, userID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := s.DB.Where("conversation_id = ?", conversationID)
	if before != "" {
		var anchor models.Message
		if err := s.DB.Where("id = ? AND conversation_id = ?", before, conversationID).First(&anchor).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, respond.Rule("That message is not in this conversation")
			}
			return nil, fmt.Errorf("loading anchor: %w", err)
		}
		q = q.Where("created_at < ? OR (created_at = ? AND id < ?)", anchor.CreatedAt, anchor.CreatedAt, anchor.ID)
	}
	var rows []models.Message
	if err := q.Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("listing messages: %w", err)
	}
	out := make([]MessageView, 0, len(rows))
	for _, m := range rows {
		out = append(out, toMessageView(m, ""))
	}
	return out, nil
}

// Send saves a message, moves the conversation to the top of every member's
// inbox, and delivers it to every member's open connections.
func (s *ChatService) Send(conversationID, senderID string, in SendInput) (MessageView, error) {
	if _, err := s.membership(conversationID, senderID); err != nil {
		return MessageView{}, err
	}
	body := strings.TrimSpace(in.Body)
	kind := in.Kind
	if kind == "" {
		kind = "text"
	}
	switch kind {
	case "text":
		if body == "" {
			return MessageView{}, respond.Rule("A message cannot be empty")
		}
	case "image", "file":
		if in.Attachment == nil || in.Attachment.URL == "" {
			return MessageView{}, respond.Rule("Attach a file to send it")
		}
	default:
		return MessageView{}, respond.Rule("Unknown message kind")
	}
	if utf8.RuneCountInString(body) > MaxMessageLength {
		return MessageView{}, respond.Rule("A message is at most %d characters", MaxMessageLength)
	}
	if len(in.ClientID) > 64 {
		return MessageView{}, respond.Rule("client_id is at most 64 characters")
	}

	msg := models.Message{ConversationID: conversationID, SenderID: senderID, Body: body, Kind: kind, Attachment: in.Attachment}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&msg).Error; err != nil {
			return err
		}
		at := jsontime.DateTime{Time: msg.CreatedAt}
		if err := tx.Model(&models.Conversation{}).Where("id = ?", conversationID).
			Updates(map[string]any{"last_message_at": at, "last_message_preview": preview(msg)}).Error; err != nil {
			return err
		}
		// Sending means you have read everything before it.
		return tx.Model(&models.Participant{}).Where("conversation_id = ? AND user_id = ?", conversationID, senderID).
			Updates(map[string]any{"last_read_at": at, "last_delivered_at": at}).Error
	})
	if err != nil {
		return MessageView{}, fmt.Errorf("sending: %w", err)
	}

	view := toMessageView(msg, in.ClientID)
	members, err := s.memberIDs(conversationID)
	if err != nil {
		return view, nil // saved; the others will see it on their next fetch
	}
	s.Hub.SendToUsers(members, realtime.Event{Type: EventMessage, Payload: view})

	if s.Notify != nil {
		var muted []string
		if err := s.DB.Model(&models.Participant{}).
			Where("conversation_id = ? AND muted = ?", conversationID, true).Pluck("user_id", &muted).Error; err == nil {
			skip := map[string]bool{senderID: true}
			for _, id := range muted {
				skip[id] = true
			}
			var recipients []string
			for _, id := range members {
				if !skip[id] {
					recipients = append(recipients, id)
				}
			}
			var sender models.User
			if len(recipients) > 0 && s.DB.First(&sender, "id = ?", senderID).Error == nil {
				s.Notify(recipients, view, toChatUser(sender))
			}
		}
	}
	return view, nil
}

// preview is what the inbox shows under a conversation's name.
func preview(m models.Message) string {
	switch m.Kind {
	case "image":
		if m.Body != "" {
			return truncate("📷 "+m.Body, 120)
		}
		return "📷 Photo"
	case "file":
		name := "File"
		if m.Attachment != nil && m.Attachment.Name != "" {
			name = m.Attachment.Name
		}
		return truncate("📎 "+name, 120)
	}
	return truncate(m.Body, 120)
}

func truncate(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}

// Mark records that the caller has received (read=false) or read (read=true)
// everything in a conversation up to now, and tells the other members, which
// is what turns their ticks grey or blue. A mark never moves backwards.
func (s *ChatService) Mark(conversationID, userID string, read bool) (Receipt, error) {
	p, err := s.membership(conversationID, userID)
	if err != nil {
		return Receipt{}, err
	}
	// GORM's clock, not time.Now().UTC(): SQLite compares times as text, so a
	// receipt written in UTC sorted before a message written a second earlier
	// in local time, and every message stayed unread.
	now := jsontime.DateTime{Time: s.DB.Config.NowFunc()}
	updates := map[string]any{"last_delivered_at": now}
	if read {
		updates["last_read_at"] = now
	}
	if err := s.DB.Model(&models.Participant{}).Where("id = ?", p.ID).Updates(updates).Error; err != nil {
		return Receipt{}, fmt.Errorf("marking: %w", err)
	}
	receipt := Receipt{ConversationID: conversationID, UserID: userID, LastDeliveredAt: &now.Time, LastReadAt: timeOf(p.LastReadAt)}
	if read {
		receipt.LastReadAt = &now.Time
	}
	if members, err := s.memberIDs(conversationID); err == nil {
		s.Hub.SendToUsers(members, realtime.Event{Type: EventReceipt, Payload: receipt})
	}
	return receipt, nil
}

// SetMuted turns notifications for a conversation off or on, for the caller.
func (s *ChatService) SetMuted(conversationID, userID string, muted bool) error {
	p, err := s.membership(conversationID, userID)
	if err != nil {
		return err
	}
	if err := s.DB.Model(&models.Participant{}).Where("id = ?", p.ID).Update("muted", muted).Error; err != nil {
		return fmt.Errorf("muting: %w", err)
	}
	return nil
}
