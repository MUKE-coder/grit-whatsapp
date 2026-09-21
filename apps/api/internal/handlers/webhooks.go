package handlers

import (
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/paginate"
	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/webhooks"
)

// WebhookHandler is the universal entry point for inbound webhooks.
// One handler, one route — POST /webhooks/:provider routes by the
// provider path param and dispatches to whatever was registered.
type WebhookHandler struct {
	DB *gorm.DB
}

func NewWebhookHandler(db *gorm.DB) *WebhookHandler {
	return &WebhookHandler{DB: db}
}

// Receive is mounted at POST /webhooks/:provider. It:
//
//  1. Looks up the provider in the registry (404 if unknown).
//  2. Reads the raw body + collects headers.
//  3. Calls Provider.Verify — 401 on signature mismatch.
//  4. Calls Provider.Extract to get (event_type, external_id).
//  5. Inserts a WebhookEvent (unique on provider+external_id — a
//     duplicate becomes status=skipped and we 200 immediately).
//  6. Calls webhooks.Dispatch in the request context.
//  7. Updates status=processed or status=failed with HandlerError.
//
// Always returns 200 to the provider on a verified+stored event so
// they don't retry forever — handler failures are surfaced via the
// admin replay endpoint.
func (h *WebhookHandler) Receive(c *gin.Context) {
	providerName := c.Param("provider")
	provider, ok := webhooks.LookupProvider(providerName)
	if !ok {
		respond.Fail(c, respond.CodeUnknownProvider, "no webhook provider registered for "+providerName)
		return
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		respond.Fail(c, respond.CodeReadBodyFailed, err.Error())
		return
	}

	headers := flattenHeaders(c.Request.Header)
	secret := os.Getenv(provider.SecretEnv)
	if err := provider.Verify(secret, body, headers); err != nil {
		respond.Fail(c, respond.CodeInvalidSignature, err.Error())
		return
	}

	eventType, externalID, err := provider.Extract(body, headers)
	if err != nil {
		respond.Fail(c, respond.CodeExtractFailed, err.Error())
		return
	}

	// A provider that supplies no event id cannot be deduplicated, and every
	// such delivery is a distinct row. NULL says that; "" would make two
	// unrelated anonymous events collide on the unique index and drop the
	// second one as a duplicate it is not.
	var externalRef *string
	if externalID != "" {
		externalRef = &externalID
	}

	event := models.WebhookEvent{
		Provider:   providerName,
		EventType:  eventType,
		ExternalID: externalRef,
		Payload:    datatypes.JSON(body),
		Status:     "pending",
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&event).Error; err != nil {
		// Duplicate (provider, external_id) — already processed.
		// Return 200 so the provider doesn't retry, and skip the handler.
		if webhooks.IsDuplicateError(err) {
			c.JSON(http.StatusOK, gin.H{"status": "skipped", "reason": "duplicate"})
			return
		}
		respond.ServerError(c, "PERSIST_FAILED", err, "Internal server error")
		return
	}

	// Dispatch in the request context so handlers can attach DB
	// timeouts / cancellation. Failures are recorded but never bubble
	// up — the provider already got a 200 once we persisted.
	if dispatchErr := webhooks.Dispatch(c.Request.Context(), &event); dispatchErr != nil {
		now := time.Now()
		if err := h.DB.WithContext(c.Request.Context()).Model(&event).Updates(map[string]interface{}{
			"status":        "failed",
			"handler_error": dispatchErr.Error(),
			"processed_at":  &now,
		}).Error; err != nil {
			log.Printf("webhooks: recording that event %s failed: %v", event.ID, err)
		}
		c.JSON(http.StatusOK, gin.H{"status": "received", "id": event.ID, "handler": "failed"})
		return
	}
	now := time.Now()
	if err := h.DB.WithContext(c.Request.Context()).Model(&event).Updates(map[string]interface{}{
		"status":       "processed",
		"processed_at": &now,
	}).Error; err != nil {
		log.Printf("webhooks: recording that event %s was processed: %v", event.ID, err)
	}
	c.JSON(http.StatusOK, gin.H{"status": "processed", "id": event.ID})
}

// List returns the recent webhook events with the standard paginate envelope.
//
//	GET /api/admin/webhooks?provider=stripe&status=failed
func (h *WebhookHandler) List(c *gin.Context) {
	q := h.DB.WithContext(c.Request.Context()).Model(&models.WebhookEvent{})
	params := paginate.Bind(c).
		With("provider", c.Query("provider")).
		With("status", c.Query("status"))

	res, err := paginate.List[models.WebhookEvent](q, params, paginate.Config{
		Sortable:     map[string]bool{"created_at": true, "status": true, "provider": true, "event_type": true},
		DefaultSort:  "created_at",
		DefaultOrder: "desc",
	})
	if err != nil {
		respond.ServerError(c, "INTERNAL_ERROR", err, "Internal server error")
		return
	}
	c.JSON(http.StatusOK, res)
}

// Replay re-runs the handler for an existing webhook event. Used to
// recover from a transient handler failure or a deploy that fixed a
// bug. Increments retry_count + records the new outcome.
//
//	POST /api/admin/webhooks/:id/replay
func (h *WebhookHandler) Replay(c *gin.Context) {
	id := c.Param("id")
	var event models.WebhookEvent
	if err := h.DB.WithContext(c.Request.Context()).First(&event, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			respond.Fail(c, respond.CodeNotFound, "webhook event not found")
			return
		}
		respond.ServerError(c, "INTERNAL_ERROR", err, "Internal server error")
		return
	}

	dispatchErr := webhooks.Dispatch(c.Request.Context(), &event)
	now := time.Now()
	// Atomic retry_count increment via gorm.Expr — two concurrent
	// replays of the same event are safe (each adds 1 instead of
	// both reading the same baseline and writing the same +1 result).
	updates := map[string]interface{}{
		"retry_count":  gorm.Expr("retry_count + ?", 1),
		"processed_at": &now,
	}
	if dispatchErr == nil {
		updates["status"] = "processed"
		updates["handler_error"] = ""
	} else {
		updates["status"] = "failed"
		updates["handler_error"] = dispatchErr.Error()
	}
	if err := h.DB.WithContext(c.Request.Context()).Model(&event).Updates(updates).Error; err != nil {
		respond.ServerError(c, "INTERNAL_ERROR", err, "Internal server error")
		return
	}
	// Re-read to get the post-increment count; the original event.RetryCount
	// is stale after the gorm.Expr update.
	_ = h.DB.WithContext(c.Request.Context()).Select("retry_count").First(&event, "id = ?", id).Error
	if dispatchErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"status":        "failed",
			"handler_error": dispatchErr.Error(),
			"retry_count":   event.RetryCount,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "processed", "retry_count": event.RetryCount})
}

// flattenHeaders turns http.Header (multi-value) into a single-value
// map for the Verify / Extract callbacks. Keeps the framework API
// simple — nobody needs the multi-value form for webhook signing.
func flattenHeaders(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for k, v := range h {
		if len(v) > 0 {
			out[k] = v[0]
		}
	}
	return out
}
