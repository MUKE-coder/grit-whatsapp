package models

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"whatsapp/apps/api/internal/crypto"
)

// TwoFactorConfig stores TOTP settings for a user.
type TwoFactorConfig struct {
	ID     uint   `gorm:"primarykey" json:"id"`
	UserID string `gorm:"size:36;uniqueIndex;not null" json:"user_id"`
	// Secret is encrypted with FIELD_ENCRYPTION_KEY when one is set. It was
	// stored in the clear, so anybody who could read the table, a backup or a
	// GORM Studio session could generate every user's codes. A secret written
	// before the key reads back as it is and is encrypted by grit migrate, or
	// the next time its code verifies. Without a key it is stored as before.
	Secret      crypto.EncryptedString      `gorm:"type:text;not null" json:"-"`
	Enabled     bool                        `gorm:"default:false" json:"enabled"`
	BackupCodes datatypes.JSONSlice[string] `gorm:"type:text" json:"-"`
	// LastUsedStep is the time step of the last code accepted. Only a later one
	// is accepted next, so a code cannot be used twice.
	LastUsedStep int64     `gorm:"not null;default:0" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TrustedDevice stores a remembered device that can skip TOTP.
type TrustedDevice struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	UserID    string         `gorm:"size:36;index;not null" json:"user_id"`
	TokenHash string         `gorm:"size:64;uniqueIndex;not null" json:"-"`
	UserAgent string         `gorm:"size:500" json:"user_agent"`
	IPAddress string         `gorm:"size:45" json:"ip_address"`
	ExpiresAt time.Time      `gorm:"not null;index" json:"expires_at"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// TOTPPendingToken stores short-lived tokens for the TOTP verification step.
type TOTPPendingToken struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	UserID    string    `gorm:"size:36;index;not null" json:"user_id"`
	TokenHash string    `gorm:"size:64;uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	// Attempts counts wrong codes against this token; at totp.MaxPendingAttempts
	// it is refused.
	Attempts  int       `gorm:"not null;default:0" json:"-"`
	CreatedAt time.Time `json:"created_at"`
}

// CleanupExpiredTOTPTokens removes expired pending tokens and trusted devices.
func CleanupExpiredTOTPTokens(db *gorm.DB) error {
	now := time.Now()
	if err := db.Where("expires_at < ?", now).Delete(&TOTPPendingToken{}).Error; err != nil {
		return err
	}
	return db.Where("expires_at < ?", now).Delete(&TrustedDevice{}).Error
}
