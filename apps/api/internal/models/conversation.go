package models

import (
	"time"

	"gorm.io/gorm"

	"whatsapp/apps/api/internal/ids"
	"whatsapp/apps/api/internal/jsontime"
)

// Conversation represents a conversation in the system.
type Conversation struct {
	ID string `gorm:"primarykey;size:36" json:"id"`
	// Title is a group's name. A direct chat has none: each side shows the
	// other person's name.
	Title string `gorm:"size:255" json:"title" search:"trigram"`
	// DirectKey is "<smaller user id>:<larger user id>" on a direct chat and
	// NULL on a group. Unique, so two people have exactly one direct chat
	// however many times, or however simultaneously, either starts it.
	DirectKey          *string            `gorm:"size:80;uniqueIndex" json:"-"`
	IsGroup            bool               `json:"is_group"`
	LastMessageAt      *jsontime.DateTime `json:"last_message_at"`
	LastMessagePreview string             `gorm:"size:255" json:"last_message_preview" search:"trigram"`
	Version            int                `gorm:"not null;default:1" json:"version"`
	CreatedAt          time.Time          `gorm:"index" json:"created_at"`
	UpdatedAt          time.Time          `gorm:"index" json:"updated_at"`
	DeletedAt          gorm.DeletedAt     `gorm:"index" json:"-"`
	// ArchivedAt is the "put this away without destroying it" state, and it is
	// deliberately not DeletedAt. A soft delete is invisible to every query and
	// means the row is gone as far as the app is concerned; an archived row is
	// still listable, still exportable and still restorable in one click. The
	// list endpoint hides archived rows unless ?archived=true asks for them.
	ArchivedAt *time.Time `gorm:"index" json:"archived_at,omitempty"`
}

// BeforeCreate generates a UUID before inserting.
func (m *Conversation) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = ids.New()
	}
	return nil
}

// BeforeUpdate increments Version so offline clients can detect server-side updates.
func (m *Conversation) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("version", gorm.Expr("version + 1"))
	return nil
}
