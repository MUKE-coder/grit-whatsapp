package services

import (
	"errors"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/realtime"
	"whatsapp/apps/api/internal/respond"
)

// newChat opens a private in-memory database with three users: ada, ben, cy.
func newChat(t *testing.T) (*ChatService, map[string]string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	// One connection: every connection to :memory: is a different database.
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&models.User{}, &models.Conversation{}, &models.Participant{}, &models.Message{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	ids := map[string]string{}
	for _, name := range []string{"ada", "ben", "cy"} {
		u := models.User{FirstName: name, LastName: "Test", Email: name + "@example.com", Active: true}
		if err := db.Create(&u).Error; err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		ids[name] = u.ID
	}
	return &ChatService{DB: db, Hub: realtime.NewHub()}, ids
}

func TestTwoPeopleHaveExactlyOneDirectChat(t *testing.T) {
	chat, u := newChat(t)
	first, err := chat.Direct(u["ada"], u["ben"])
	if err != nil {
		t.Fatal(err)
	}
	second, err := chat.Direct(u["ben"], u["ada"])
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("ada->ben is %s and ben->ada is %s; want one conversation", first.ID, second.ID)
	}
	if len(first.Members) != 2 {
		t.Errorf("%d members, want 2", len(first.Members))
	}
}

func TestYouCannotMessageYourself(t *testing.T) {
	chat, u := newChat(t)
	_, err := chat.Direct(u["ada"], u["ada"])
	if _, ok := respond.IsRule(err); !ok {
		t.Fatalf("got %v, want a rule error", err)
	}
}

// Someone outside a conversation gets the same answer as for one that does not
// exist, for every read and write.
func TestOutsidersCannotTellAConversationExists(t *testing.T) {
	chat, u := newChat(t)
	conv, err := chat.Direct(u["ada"], u["ben"])
	if err != nil {
		t.Fatal(err)
	}
	checks := map[string]error{}
	_, checks["view"] = chat.Conversation(conv.ID, u["cy"])
	_, checks["messages"] = chat.Messages(conv.ID, u["cy"], "", 10)
	_, checks["send"] = chat.Send(conv.ID, u["cy"], SendInput{Body: "hi"})
	_, checks["read"] = chat.Mark(conv.ID, u["cy"], true)
	checks["mute"] = chat.SetMuted(conv.ID, u["cy"], true)
	for name, err := range checks {
		if !errors.Is(err, ErrNoSuchConversation) {
			t.Errorf("%s by an outsider: %v, want ErrNoSuchConversation", name, err)
		}
	}
	if chat.IsMember(conv.ID, u["cy"]) {
		t.Error("the channel authorizer would let an outsider in")
	}
}

func TestSendingMovesTheInboxAndCountsUnread(t *testing.T) {
	chat, u := newChat(t)
	conv, err := chat.Direct(u["ada"], u["ben"])
	if err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{"one", "two", "three"} {
		if _, err := chat.Send(conv.ID, u["ada"], SendInput{Body: body}); err != nil {
			t.Fatal(err)
		}
	}
	inbox, err := chat.Conversations(u["ben"])
	if err != nil {
		t.Fatal(err)
	}
	if len(inbox) != 1 || inbox[0].Unread != 3 || inbox[0].LastMessagePreview != "three" {
		t.Fatalf("ben's inbox = %+v, want one row, 3 unread, preview \"three\"", inbox)
	}
	mine, err := chat.Conversations(u["ada"])
	if err != nil {
		t.Fatal(err)
	}
	if mine[0].Unread != 0 {
		t.Errorf("the sender has %d unread of their own messages", mine[0].Unread)
	}

	if _, err := chat.Mark(conv.ID, u["ben"], true); err != nil {
		t.Fatal(err)
	}
	inbox, err = chat.Conversations(u["ben"])
	if err != nil {
		t.Fatal(err)
	}
	if inbox[0].Unread != 0 {
		t.Errorf("after reading, ben has %d unread", inbox[0].Unread)
	}
}

func TestEmptyAndOversizedMessagesAreRefused(t *testing.T) {
	chat, u := newChat(t)
	conv, err := chat.Direct(u["ada"], u["ben"])
	if err != nil {
		t.Fatal(err)
	}
	long := make([]rune, MaxMessageLength+1)
	for i := range long {
		long[i] = 'x'
	}
	for name, in := range map[string]SendInput{
		"empty":          {Body: "   "},
		"too long":       {Body: string(long)},
		"image, no file": {Kind: "image"},
		"unknown kind":   {Kind: "sticker", Body: "x"},
	} {
		if _, err := chat.Send(conv.ID, u["ada"], in); err == nil {
			t.Errorf("%s: sent, want refused", name)
		}
	}
}

// Paging backwards with before=<id> returns each message exactly once, even
// when several share a timestamp.
func TestMessagesPageBackwardsWithoutGapsOrRepeats(t *testing.T) {
	chat, u := newChat(t)
	conv, err := chat.Direct(u["ada"], u["ben"])
	if err != nil {
		t.Fatal(err)
	}
	same := time.Now().UTC().Truncate(time.Second)
	for i := 0; i < 7; i++ {
		m := models.Message{ConversationID: conv.ID, SenderID: u["ada"], Body: "m", Kind: "text", CreatedAt: same}
		if err := chat.DB.Create(&m).Error; err != nil {
			t.Fatal(err)
		}
	}
	seen := map[string]bool{}
	before := ""
	for page := 0; page < 10; page++ {
		got, err := chat.Messages(conv.ID, u["ben"], before, 3)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) == 0 {
			break
		}
		for _, m := range got {
			if seen[m.ID] {
				t.Fatalf("message %s came back twice", m.ID)
			}
			seen[m.ID] = true
		}
		before = got[len(got)-1].ID
	}
	if len(seen) != 7 {
		t.Errorf("paged through %d messages, want 7", len(seen))
	}
}

func TestAGroupNeedsANameAndRealMembers(t *testing.T) {
	chat, u := newChat(t)
	if _, err := chat.Group(u["ada"], "", []string{u["ben"]}); err == nil {
		t.Error("a group with no name was created")
	}
	if _, err := chat.Group(u["ada"], "Team", []string{"no-such-user"}); err == nil {
		t.Error("a group with an unknown member was created")
	}
	if _, err := chat.Group(u["ada"], "Team", []string{u["ada"]}); err == nil {
		t.Error("a group of one was created")
	}
	group, err := chat.Group(u["ada"], "Team", []string{u["ben"], u["cy"], u["ben"]})
	if err != nil {
		t.Fatal(err)
	}
	if len(group.Members) != 3 {
		t.Errorf("%d members, want 3 (duplicates dropped)", len(group.Members))
	}
	if !chat.SharesConversation(u["ben"], u["cy"]) {
		t.Error("two members of one group do not share a conversation")
	}
}

func TestMutedMembersAreNotNotified(t *testing.T) {
	chat, u := newChat(t)
	group, err := chat.Group(u["ada"], "Team", []string{u["ben"], u["cy"]})
	if err != nil {
		t.Fatal(err)
	}
	if err := chat.SetMuted(group.ID, u["cy"], true); err != nil {
		t.Fatal(err)
	}
	var notified []string
	chat.Notify = func(recipients []string, _ MessageView, _ ChatUser) { notified = recipients }
	if _, err := chat.Send(group.ID, u["ada"], SendInput{Body: "standup in 5"}); err != nil {
		t.Fatal(err)
	}
	if len(notified) != 1 || notified[0] != u["ben"] {
		t.Errorf("notified %v, want only ben (ada sent it, cy muted it)", notified)
	}
}
