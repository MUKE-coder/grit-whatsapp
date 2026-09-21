package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/boombuler/barcode/qr"
	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"whatsapp/apps/api/internal/crypto"
	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/services"
	"whatsapp/apps/api/internal/totp"
)

// TOTPHandler handles two-factor authentication endpoints.
type TOTPHandler struct {
	DB          *gorm.DB
	AuthService *services.AuthService
	Issuer      string // App name for authenticator display
}

type totpSetupResponse struct {
	Secret string `json:"secret"`
	URI    string `json:"uri"`
	// QRCode is a data: URI holding a PNG of URI, ready to drop straight into
	// an <img src>. Rendered here rather than in each client because there are
	// four of them (admin, web, desktop, Expo) and none should have to ship a
	// QR encoder — or handle the raw secret — to show a setup screen.
	QRCode string `json:"qr_code"`
}

type EnableTOTPRequest struct {
	Secret string `json:"secret" binding:"required"`
	Code   string `json:"code" binding:"required"`
}

type VerifyTOTPRequest struct {
	PendingToken string `json:"pending_token" binding:"required"`
	Code         string `json:"code" binding:"required"`
	TrustDevice  bool   `json:"trust_device"`
}

type DisableTOTPRequest struct {
	Password string `json:"password" binding:"required"`
}

type VerifyBackupCodeRequest struct {
	PendingToken string `json:"pending_token" binding:"required"`
	Code         string `json:"code" binding:"required"`
	TrustDevice  bool   `json:"trust_device"`
}

// Setup generates a new TOTP secret and QR code URI for the user.
// The secret is NOT stored yet — the user must verify it first via Enable.
func (h *TOTPHandler) Setup(c *gin.Context) {
	userID := c.GetString("user_id")
	user, _ := c.Get("user")
	// Set by the auth middleware. Checked rather than asserted, so the route
	// mounted without it answers 401 instead of panicking.
	u, ok := user.(models.User)
	if !ok {
		respond.Fail(c, respond.CodeUnauthorized, "Not signed in")
		return
	}

	// Check if TOTP is already enabled
	var existing models.TwoFactorConfig
	if err := h.DB.WithContext(c.Request.Context()).Where("user_id = ?", userID).First(&existing).Error; err == nil && existing.Enabled {
		respond.Fail(c, respond.CodeTOTPAlreadyEnabled, "Two-factor authentication is already enabled")
		return
	}

	secret, err := totp.GenerateSecret()
	if err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to generate secret")
		return
	}

	uri := totp.GenerateURI(secret, u.Email, h.Issuer)

	// Medium recovery level: a phone camera reads it reliably at the size a
	// setup dialog shows it, without the density High produces.
	qrPNG, err := qrCodePNG(uri, 256)
	if err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to render the QR code")
		return
	}
	qrDataURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(qrPNG)

	c.JSON(http.StatusOK, gin.H{
		"data": totpSetupResponse{
			Secret: secret,
			URI:    uri,
			QRCode: qrDataURI,
		},
		"message": "Scan the QR code with your authenticator app, then verify with a code",
	})
}

// Enable verifies the initial TOTP code and activates 2FA for the user.
// Returns backup codes that the user should save.
func (h *TOTPHandler) Enable(c *gin.Context) {
	userID := c.GetString("user_id")

	var req EnableTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	// Enabling replaces the secret, so it is refused while 2FA is on: a stolen
	// session could otherwise re-enrol the account to an authenticator the
	// attacker holds. Disabling first asks for the password.
	var existing models.TwoFactorConfig
	if err := h.DB.WithContext(c.Request.Context()).Where("user_id = ?", userID).First(&existing).Error; err == nil && existing.Enabled {
		respond.Fail(c, respond.CodeTOTPAlreadyEnabled, "Two-factor authentication is already enabled. Disable it first.")
		return
	}

	// Verify the code matches the secret
	step, valid, err := totp.ValidateCodeStep(req.Secret, req.Code)
	if err != nil || !valid {
		respond.Fail(c, respond.CodeInvalidTOTPCode, "Invalid verification code. Make sure your authenticator app is synced.")
		return
	}

	// Generate backup codes
	codes, hashes, err := totp.GenerateBackupCodes(0)
	if err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to generate backup codes")
		return
	}

	// Upsert the TwoFactorConfig
	var config models.TwoFactorConfig
	if err := h.DB.WithContext(c.Request.Context()).Where("user_id = ?", userID).FirstOrCreate(&config, models.TwoFactorConfig{UserID: userID}).Error; err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to enable two-factor authentication")
		return
	}

	// Encrypted at rest when FIELD_ENCRYPTION_KEY is set: see models.TwoFactorConfig.
	config.Secret = crypto.EncryptedString(req.Secret)
	config.Enabled = true
	config.BackupCodes = hashes
	// The code that enabled 2FA is spent; it cannot also sign in.
	config.LastUsedStep = step

	if err := h.DB.WithContext(c.Request.Context()).Save(&config).Error; err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to enable two-factor authentication")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"enabled":      true,
			"backup_codes": codes,
		},
		"message": "Two-factor authentication enabled. Save your backup codes in a safe place.",
	})
}

// Verify validates a TOTP code during the login flow (after password check).
// Exchanges a pending token + valid TOTP code for real JWT tokens.
func (h *TOTPHandler) Verify(c *gin.Context) {
	var req VerifyTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	pending, user, config, ok := h.beginSecondFactor(c, req.PendingToken)
	if !ok {
		return
	}

	step, valid, err := totp.ValidateCodeStep(string(config.Secret), req.Code)
	if err == nil && valid {
		// A code is good for its window, so without this the same code signs in
		// again for as long as it lasts. The step only moves forward, and the
		// update is conditional, so two requests cannot both spend one code.
		res := h.DB.WithContext(c.Request.Context()).Model(&models.TwoFactorConfig{}).
			Where("id = ? AND last_used_step < ?", config.ID, step).
			UpdateColumn("last_used_step", step)
		valid = res.Error == nil && res.RowsAffected == 1
	}
	if err != nil || !valid {
		h.failSecondFactor(pending, user)
		respond.Fail(c, respond.CodeInvalidTOTPCode, "Invalid verification code")
		return
	}

	h.sealSecret(c, config)
	h.completeSecondFactor(c, pending, user, req.TrustDevice, nil, "Logged in successfully")
}

// sealSecret stores a secret that is still in the clear encrypted, once it has
// verified a code.
//
// EncryptedString reads a value without its enc:v1: prefix as it is, so a
// secret enabled before FIELD_ENCRYPTION_KEY was set keeps working. grit migrate
// encrypts all of them at once; this covers a project that has not run it. The
// update matches only a row that is still plaintext, and a failure is logged
// and changes nothing: the secret keeps verifying either way.
func (h *TOTPHandler) sealSecret(c *gin.Context, config *models.TwoFactorConfig) {
	if !crypto.EncryptionEnabled() {
		return
	}
	if err := h.DB.WithContext(c.Request.Context()).Model(&models.TwoFactorConfig{}).
		Where("id = ? AND secret NOT LIKE ?", config.ID, "enc:v1:%").
		UpdateColumn("secret", config.Secret).Error; err != nil {
		log.Printf("totp: encrypting the stored secret for %s: %v", config.UserID, err)
	}
}

// VerifyBackupCode validates a backup code during login (alternative to TOTP).
func (h *TOTPHandler) VerifyBackupCode(c *gin.Context) {
	var req VerifyBackupCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	pending, user, config, ok := h.beginSecondFactor(c, req.PendingToken)
	if !ok {
		return
	}

	idx := totp.VerifyBackupCode(req.Code, config.BackupCodes)
	if idx < 0 {
		h.failSecondFactor(pending, user)
		respond.Fail(c, respond.CodeInvalidBackupCode, "Invalid backup code")
		return
	}

	// Spend the backup code before signing in, and fail if that cannot be saved:
	// a code that stays in the list stays usable.
	remaining := make([]string, 0, len(config.BackupCodes)-1)
	remaining = append(remaining, config.BackupCodes[:idx]...)
	remaining = append(remaining, config.BackupCodes[idx+1:]...)
	// The update matches only while the list is still the one this request
	// read. Two requests carrying the same code both find it in the list; only
	// the first to write can spend it, and the other is refused.
	read, err := json.Marshal([]string(config.BackupCodes))
	if err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to use the backup code")
		return
	}
	res := h.DB.WithContext(c.Request.Context()).Model(&models.TwoFactorConfig{}).
		Where("id = ? AND backup_codes = ?", config.ID, string(read)).
		Update("backup_codes", datatypes.JSONSlice[string](remaining))
	if res.Error != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to use the backup code")
		return
	}
	if res.RowsAffected != 1 {
		h.failSecondFactor(pending, user)
		respond.Fail(c, respond.CodeInvalidBackupCode, "Invalid backup code")
		return
	}
	config.BackupCodes = remaining
	h.sealSecret(c, config)

	h.completeSecondFactor(c, pending, user, req.TrustDevice, gin.H{"backup_codes_remaining": len(remaining)},
		"Logged in successfully with backup code")
}

// beginSecondFactor loads what a second-factor attempt needs, and refuses one
// that must not go ahead: a pending token that is unknown, expired or out of
// attempts, or an account that is disabled or locked. Password sign-in makes
// the same account checks; before, the second step skipped them.
func (h *TOTPHandler) beginSecondFactor(c *gin.Context, pendingToken string) (*models.TOTPPendingToken, *models.User, *models.TwoFactorConfig, bool) {
	invalid := func() {
		respond.Fail(c, respond.CodeInvalidPendingToken, "Invalid or expired verification session. Please log in again.")
	}

	var pending models.TOTPPendingToken
	if err := h.DB.WithContext(c.Request.Context()).Where("token_hash = ? AND expires_at > ?", totp.HashToken(pendingToken), time.Now()).First(&pending).Error; err != nil {
		invalid()
		return nil, nil, nil, false
	}
	if pending.Attempts >= totp.MaxPendingAttempts {
		invalid()
		return nil, nil, nil, false
	}

	var user models.User
	if err := h.DB.WithContext(c.Request.Context()).Where("id = ?", pending.UserID).First(&user).Error; err != nil {
		invalid()
		return nil, nil, nil, false
	}
	if !user.Active {
		respond.Fail(c, respond.CodeAccountDisabled, "Your account has been disabled")
		return nil, nil, nil, false
	}
	if user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
		respond.Fail(c, respond.CodeAccountLocked, "Too many failed attempts. Try again later, or reset your password.")
		return nil, nil, nil, false
	}

	var config models.TwoFactorConfig
	if err := h.DB.WithContext(c.Request.Context()).Where("user_id = ? AND enabled = ?", pending.UserID, true).First(&config).Error; err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Two-factor configuration not found")
		return nil, nil, nil, false
	}
	return &pending, &user, &config, true
}

// failSecondFactor counts a wrong code against the pending token and against
// the account. Each count is its own UPDATE, so concurrent guesses cannot share
// one increment. Before, a pending token took unlimited guesses, and signing in
// again with the password cleared the account's count.
func (h *TOTPHandler) failSecondFactor(pending *models.TOTPPendingToken, user *models.User) {
	if err := h.DB.Model(&models.TOTPPendingToken{}).Where("id = ?", pending.ID).
		UpdateColumn("attempts", gorm.Expr("attempts + 1")).Error; err != nil {
		log.Printf("totp: counting an attempt for %s: %v", user.ID, err)
	}
	if err := h.DB.Model(&models.User{}).Where("id = ?", user.ID).
		UpdateColumn("failed_login_count", gorm.Expr("failed_login_count + 1")).Error; err != nil {
		log.Printf("totp: counting a failure for %s: %v", user.ID, err)
		return
	}

	var fresh models.User
	if err := h.DB.Select("id", "failed_login_count").First(&fresh, "id = ?", user.ID).Error; err != nil {
		return
	}
	if totp.MaxFailedAttempts <= 0 || fresh.FailedLoginCount < totp.MaxFailedAttempts {
		return
	}
	until := time.Now().Add(totp.LockoutDuration)
	if err := h.DB.Model(&models.User{}).Where("id = ?", user.ID).
		Updates(map[string]interface{}{"locked_until": until, "failed_login_count": 0}).Error; err != nil {
		log.Printf("totp: locking %s: %v", user.ID, err)
		return
	}
	if err := h.DB.Where("user_id = ?", user.ID).Delete(&models.TOTPPendingToken{}).Error; err != nil {
		log.Printf("totp: clearing pending tokens for %s: %v", user.ID, err)
	}
	log.Printf("lockout: %s locked until %s after %d wrong 2FA codes", user.Email, until.Format(time.RFC3339), totp.MaxFailedAttempts)
}

// completeSecondFactor spends the pending token, clears the failure count and
// signs the user in.
func (h *TOTPHandler) completeSecondFactor(c *gin.Context, pending *models.TOTPPendingToken, user *models.User, trustDevice bool, extra gin.H, message string) {
	// Only the request that deletes the pending token may use it, so two
	// requests carrying one token cannot both sign in.
	res := h.DB.WithContext(c.Request.Context()).Delete(&models.TOTPPendingToken{}, pending.ID)
	if res.Error != nil || res.RowsAffected != 1 {
		respond.Fail(c, respond.CodeInvalidPendingToken, "Invalid or expired verification session. Please log in again.")
		return
	}
	if user.FailedLoginCount > 0 || user.LockedUntil != nil {
		if err := h.DB.WithContext(c.Request.Context()).Model(&models.User{}).Where("id = ?", user.ID).
			Updates(map[string]interface{}{"failed_login_count": 0, "locked_until": nil}).Error; err != nil {
			log.Printf("totp: clearing the failure count for %s: %v", user.ID, err)
		}
	}

	tokens, err := h.AuthService.GenerateTokenPair(user.ID, user.Email, user.Role)
	if err != nil {
		respond.Fail(c, respond.CodeTokenError, "Failed to generate tokens")
		return
	}
	// Record the session. An access token names its session, and one whose
	// session was never recorded is refused on its first request.
	if _, err := services.CreateSession(h.DB, c, user.ID, tokens.RefreshToken); err != nil {
		log.Printf("totp: failed to record session for %s: %v", user.ID, err)
	}

	if trustDevice {
		h.createTrustedDevice(c, user.ID)
	}

	// Mirror tokens into HttpOnly cookies so the browser client doesn't
	// need to handle them in JS. Native bearer clients use the JSON body.
	h.AuthService.SetAuthCookies(c, tokens)

	data := gin.H{"user": user, "tokens": tokens}
	for k, v := range extra {
		data[k] = v
	}
	c.JSON(http.StatusOK, gin.H{"data": data, "message": message})
}

// Disable turns off 2FA for the user (requires password confirmation).
func (h *TOTPHandler) Disable(c *gin.Context) {
	userID := c.GetString("user_id")

	var req DisableTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	// Verify password
	var user models.User
	if err := h.DB.WithContext(c.Request.Context()).Where("id = ?", userID).First(&user).Error; err != nil {
		respond.Fail(c, respond.CodeNotFound, "User not found")
		return
	}

	if !user.CheckPassword(req.Password) {
		respond.Fail(c, respond.CodeInvalidPassword, "Incorrect password")
		return
	}

	// The config, the trusted devices and the pending tokens go together, or
	// none of them do. The three deletes ran unchecked, and the answer was
	// "disabled" whether or not anything had been deleted.
	if err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		for _, table := range []interface{}{&models.TwoFactorConfig{}, &models.TrustedDevice{}, &models.TOTPPendingToken{}} {
			if err := tx.Where("user_id = ?", userID).Delete(table).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to disable two-factor authentication")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Two-factor authentication disabled",
	})
}

// Status returns whether TOTP is enabled for the current user.
func (h *TOTPHandler) Status(c *gin.Context) {
	userID := c.GetString("user_id")

	var config models.TwoFactorConfig
	enabled := false
	backupCodesRemaining := 0

	if err := h.DB.WithContext(c.Request.Context()).Where("user_id = ?", userID).First(&config).Error; err == nil {
		enabled = config.Enabled
		backupCodesRemaining = len(config.BackupCodes)
	}

	// Count trusted devices
	var deviceCount int64
	h.DB.WithContext(c.Request.Context()).Model(&models.TrustedDevice{}).Where("user_id = ? AND expires_at > ?", userID, time.Now()).Count(&deviceCount)

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"enabled":                enabled,
			"backup_codes_remaining": backupCodesRemaining,
			"trusted_devices":        deviceCount,
		},
	})
}

// RegenerateBackupCodes creates a new set of backup codes, replacing the old ones.
func (h *TOTPHandler) RegenerateBackupCodes(c *gin.Context) {
	userID := c.GetString("user_id")

	var config models.TwoFactorConfig
	if err := h.DB.WithContext(c.Request.Context()).Where("user_id = ? AND enabled = ?", userID, true).First(&config).Error; err != nil {
		respond.Fail(c, respond.CodeTOTPNotEnabled, "Two-factor authentication is not enabled")
		return
	}

	codes, hashes, err := totp.GenerateBackupCodes(0)
	if err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to generate backup codes")
		return
	}

	config.BackupCodes = hashes
	if err := h.DB.WithContext(c.Request.Context()).Save(&config).Error; err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to save backup codes")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"backup_codes": codes,
		},
		"message": "New backup codes generated. Previous codes are now invalid.",
	})
}

// ListTrustedDevices returns the devices allowed to skip the TOTP prompt.
//
// The status endpoint only reports a count, which is enough to nag with and
// useless to act on: "3 trusted devices" tells a user nothing about whether
// one of them is a laptop they sold. Expired rows are filtered rather than
// deleted here — the nightly cleanup owns deletion, and a read should not
// mutate.
func (h *TOTPHandler) ListTrustedDevices(c *gin.Context) {
	userID := c.GetString("user_id")

	var devices []models.TrustedDevice
	if err := h.DB.WithContext(c.Request.Context()).
		Where("user_id = ? AND expires_at > ?", userID, time.Now()).
		Order("created_at desc").
		Find(&devices).Error; err != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to load trusted devices")
		return
	}

	// The caller's own device is marked so the UI can label it rather than
	// inviting someone to revoke the browser they are sitting in.
	currentHash := ""
	if cookie, err := c.Cookie("totp_trusted"); err == nil && cookie != "" {
		currentHash = totp.HashToken(cookie)
	}

	out := make([]gin.H, 0, len(devices))
	for _, d := range devices {
		out = append(out, gin.H{
			"id":         d.ID,
			"user_agent": d.UserAgent,
			"ip_address": d.IPAddress,
			"created_at": d.CreatedAt,
			"expires_at": d.ExpiresAt,
			"current":    currentHash != "" && d.TokenHash == currentHash,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": out})
}

// RevokeTrustedDevice removes one trusted device by id.
func (h *TOTPHandler) RevokeTrustedDevice(c *gin.Context) {
	userID := c.GetString("user_id")

	// Scoped to the caller: without the user_id predicate this would let any
	// authenticated user revoke anyone's device by guessing an id.
	res := h.DB.WithContext(c.Request.Context()).Where("id = ? AND user_id = ?", c.Param("id"), userID).
		Delete(&models.TrustedDevice{})
	if res.Error != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to revoke the device")
		return
	}
	if res.RowsAffected == 0 {
		respond.Fail(c, respond.CodeNotFound, "Trusted device not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device revoked. It will need a code at the next sign-in."})
}

// RevokeTrustedDevices removes all trusted devices for the current user.
func (h *TOTPHandler) RevokeTrustedDevices(c *gin.Context) {
	userID := c.GetString("user_id")

	if err := h.DB.WithContext(c.Request.Context()).Where("user_id = ?", userID).Delete(&models.TrustedDevice{}).Error; err != nil {
		respond.Fail(c, respond.CodeTOTPError, "Failed to revoke trusted devices")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "All trusted devices revoked. You will need to enter a TOTP code on next login.",
	})
}

// createTrustedDevice stores a trusted device and sets the cookie.
func (h *TOTPHandler) createTrustedDevice(c *gin.Context, userID string) {
	deviceToken, err := totp.GenerateDeviceToken()
	if err != nil {
		return // Non-critical, skip silently
	}

	device := models.TrustedDevice{
		UserID:    userID,
		TokenHash: totp.HashToken(deviceToken),
		UserAgent: c.Request.UserAgent(),
		IPAddress: c.ClientIP(),
		ExpiresAt: time.Now().Add(totp.TrustedDeviceDuration),
	}

	if err := h.DB.WithContext(c.Request.Context()).Create(&device).Error; err != nil {
		return // Non-critical
	}

	// Secure whenever the request came over HTTPS, directly or through a proxy
	// that says so, as the auth cookies are, and SameSite=Lax like them. The
	// cookie that lets a device skip the second factor was neither, so it went
	// out over plain HTTP and rode along with requests other sites started.
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("totp_trusted", deviceToken, int(totp.TrustedDeviceDuration.Seconds()), "/", "", secure, true)
}

// IsTrustedDevice checks if the current request has a valid trusted device cookie.
func IsTrustedDevice(c *gin.Context, db *gorm.DB, userID string) bool {
	token, err := c.Cookie("totp_trusted")
	if err != nil || token == "" {
		return false
	}

	tokenHash := totp.HashToken(token)
	var device models.TrustedDevice
	if err := db.Where("user_id = ? AND token_hash = ? AND expires_at > ?", userID, tokenHash, time.Now()).First(&device).Error; err != nil {
		return false
	}

	// Refresh the device expiry (sliding window). The device is trusted either
	// way; a refresh that fails only means the window is not extended.
	device.ExpiresAt = time.Now().Add(totp.TrustedDeviceDuration)
	if err := db.Model(&device).Update("expires_at", device.ExpiresAt).Error; err != nil {
		log.Printf("totp: extending trusted device %d: %v", device.ID, err)
	}

	return true
}

// qrCodePNG renders content as a PNG QR code at most size pixels square, at the
// Medium recovery level, with the four-module quiet zone a phone camera needs
// to find the code on a dark page. Whole pixels per module keep the edges sharp.
func qrCodePNG(content string, size int) ([]byte, error) {
	code, err := qr.Encode(content, qr.M, qr.Auto)
	if err != nil {
		return nil, err
	}
	bounds := code.Bounds()
	modules := bounds.Dx() + 8
	scale := size / modules
	if scale < 1 {
		scale = 1
	}
	img := image.NewGray(image.Rect(0, 0, modules*scale, modules*scale))
	draw.Draw(img, img.Bounds(), image.White, image.Point{}, draw.Src)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if color.GrayModel.Convert(code.At(x, y)).(color.Gray).Y >= 128 {
				continue
			}
			left, top := (x-bounds.Min.X+4)*scale, (y-bounds.Min.Y+4)*scale
			draw.Draw(img, image.Rect(left, top, left+scale, top+scale), image.Black, image.Point{}, draw.Src)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
