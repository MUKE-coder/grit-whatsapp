package models

import (
	"time"

	"gorm.io/gorm"

	"whatsapp/apps/api/internal/files"
	"whatsapp/apps/api/internal/ids"
)

// Message represents a message in the system.
type Message struct {
	ID             string         `gorm:"primarykey;size:36" json:"id"`
	ConversationID string         `gorm:"size:36;index" json:"conversation_id" binding:"required"`
	Conversation   *Conversation  `gorm:"foreignKey:ConversationID" json:"conversation,omitempty"`
	SenderID       string         `gorm:"size:36;index" json:"sender_id" binding:"required"`
	Sender         *User          `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	Body           string         `gorm:"type:text" json:"body" search:"trigram"`
	Kind           string         `gorm:"size:255" json:"kind" binding:"required"`
	Attachment     *files.FileRef `gorm:"type:json" json:"attachment"`
	Version        int            `gorm:"not null;default:1" json:"version"`
	CreatedAt      time.Time      `gorm:"index" json:"created_at"`
	UpdatedAt      time.Time      `gorm:"index" json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	// ArchivedAt is the "put this away without destroying it" state, and it is
	// deliberately not DeletedAt. A soft delete is invisible to every query and
	// means the row is gone as far as the app is concerned; an archived row is
	// still listable, still exportable and still restorable in one click. The
	// list endpoint hides archived rows unless ?archived=true asks for them.
	ArchivedAt *time.Time `gorm:"index" json:"archived_at,omitempty"`
}

// BeforeCreate generates a UUID before inserting.
func (m *Message) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = ids.New()
	}
	return nil
}

// BeforeUpdate increments Version so offline clients can detect server-side updates.
func (m *Message) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("version", gorm.Expr("version + 1"))
	return nil
}
