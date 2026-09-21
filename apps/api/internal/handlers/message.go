package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"whatsapp/apps/api/internal/authz"
	"whatsapp/apps/api/internal/concurrency"
	"whatsapp/apps/api/internal/events"
	"whatsapp/apps/api/internal/export"
	"whatsapp/apps/api/internal/files"
	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/paginate"
	"whatsapp/apps/api/internal/pdf"
	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/services"
	"whatsapp/apps/api/internal/storage"
)

// MessageHandler serves the message endpoints. It reads the request, asks
// services.MessageService, and writes the answer; it runs no query of its
// own, so everything a route does is also available to a job or a test.
type MessageHandler struct {
	DB      *gorm.DB
	Storage *storage.Storage
	// AppName brands the PDF export. The route file sets it from config.
	AppName string
}

// service is the message service over this handler's database.
func (h *MessageHandler) service() *services.MessageService {
	return &services.MessageService{DB: h.DB, Storage: h.Storage}
}

// ctx is the request's context with the caller on it, which the service
// scopes owned rows by. The organization the multitenant plugin resolved and
// the cancellation when the client goes away travel with it.
func (h *MessageHandler) ctx(c *gin.Context) context.Context {
	return authz.WithActor(c.Request.Context(), authz.ActorOf(c))
}

// fail answers an error from the service: a version conflict with the version
// the record is at, a missing row with 404, a broken rule with 422 and its
// message, and anything else as an opaque 500 that is logged.
func (h *MessageHandler) fail(c *gin.Context, err error, fallback string) {
	var conflict *concurrency.ErrConflict
	switch {
	case errors.As(err, &conflict):
		concurrency.WriteConflict(c, conflict.Current)
	case errors.Is(err, gorm.ErrRecordNotFound):
		respond.Fail(c, respond.CodeNotFound, "Message not found")
	default:
		respond.WriteError(c, err, fallback)
	}
}

// List returns a paginated list of messages.
//
//	?archived=true   only archived rows
//	?archived=all    both
//	(default)        only live rows
func (h *MessageHandler) List(c *gin.Context) {
	res, err := h.service().List(h.ctx(c), paginate.Bind(c).With("conversation_id", c.Query("conversation_id")).With("sender_id", c.Query("sender_id")), c.Query("archived"))
	if err != nil {
		h.fail(c, err, "Failed to fetch messages")
		return
	}

	c.JSON(http.StatusOK, res)
}

// Export streams the full filtered list as CSV (default) or XLSX: the same
// search as List, without pages.
//
//	GET /api/messages/export?format=csv
//	GET /api/messages/export?format=xlsx&search=foo
func (h *MessageHandler) Export(c *gin.Context) {
	format := c.DefaultQuery("format", "csv")
	search := c.Query("search")

	opts := export.Options{
		Sheet: "Messages",
		Columns: []export.Column{
			{Header: "ID", Field: "ID"},
			{Header: "Body", Field: "Body"},
			{Header: "Kind", Field: "Kind"},
			{Header: "Attachment", Field: "Attachment"},
			{Header: "Created At", Field: "CreatedAt", Format: "date:2006-01-02"},
		},
	}

	if format == "xlsx" {
		// Rows go into the workbook batch by batch, through a writer that moves
		// them to a temporary file, so memory stays flat however many match.
		sheet, err := export.NewXLSXStream(opts)
		if err != nil {
			h.fail(c, err, "Failed to export messages")
			return
		}
		defer func() {
			if err := sheet.Close(); err != nil {
				log.Printf("export messages as xlsx: removing temporary files: %v", err)
			}
		}()
		if err := h.service().Export(h.ctx(c), search, func(rows []models.Message) error {
			return sheet.Rows(rows)
		}); err != nil {
			h.fail(c, err, "Failed to export messages")
			return
		}
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.Header("Content-Disposition", `attachment; filename="messages.xlsx"`)
		if err := sheet.Finish(c.Writer); err != nil {
			log.Printf("export messages as xlsx: %v", err)
		}
		return
	}

	// CSV streams: the header with the first batch, then each batch as it is
	// read.
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", `attachment; filename="messages.csv"`)

	headerWritten := false
	err := h.service().Export(h.ctx(c), search, func(rows []models.Message) error {
		if !headerWritten {
			headerWritten = true
			return export.CSV(c.Writer, rows, opts)
		}
		return export.CSVRows(c.Writer, rows, opts)
	})
	if err == nil && !headerWritten {
		// Nothing matched: still a CSV, with its header row.
		err = export.CSV(c.Writer, []models.Message{}, opts)
	}
	if err != nil {
		if !c.Writer.Written() {
			c.Writer.Header().Del("Content-Type")
			c.Writer.Header().Del("Content-Disposition")
			h.fail(c, err, "Failed to export messages")
			return
		}
		// Rows are already on the wire, so the status cannot change. Logged,
		// so a truncated file has an explanation somewhere.
		log.Printf("export messages: %v", err)
	}
}

// GetByID returns a single message by ID.
func (h *MessageHandler) GetByID(c *gin.Context) {
	item, err := h.service().GetByID(h.ctx(c), c.Param("id"))
	if err != nil {
		h.fail(c, err, "Failed to load message")
		return
	}

	// The version to send back as If-Match when saving.
	c.Header("ETag", concurrency.Tag(item.Version))
	c.JSON(http.StatusOK, gin.H{
		"data": item,
	})
}

// PDF streams this message as a print-ready PDF: a repeating header and
// footer with page numbers, the record's fields as a detail grid, and any
// line items as a table. Edit the pdf.Record below to restyle it; the
// renderer itself lives in internal/pdf/record.go.
func (h *MessageHandler) PDF(c *gin.Context) {
	id := c.Param("id")

	item, err := h.service().GetByID(h.ctx(c), id)
	if err != nil {
		h.fail(c, err, "Failed to load message")
		return
	}

	appName := h.AppName
	if appName == "" {
		appName = "Message"
	}

	rec := pdf.Record{
		Title:      "MESSAGE",
		Subtitle:   pdf.Value(item.ID),
		Brand:      appName,
		FooterNote: appName + " · generated " + time.Now().Format("2 Jan 2006 15:04"),
		Fields: []pdf.Field{
			{Label: "Conversation", Value: pdf.Display(item.Conversation)},
			{Label: "Sender", Value: pdf.Display(item.Sender)},
			{Label: "Body", Value: pdf.Value(item.Body)},
			{Label: "Kind", Value: pdf.Value(item.Kind)},
			{Label: "Created", Value: pdf.Value(item.CreatedAt)},
		},
	}

	out, err := pdf.RenderRecord(rec)
	if err != nil {
		respond.Fail(c, respond.CodePDFError, "could not render the PDF")
		return
	}

	filename := "message-" + id + ".pdf"
	c.Header("Content-Disposition", "inline; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/pdf", out)
}

// CreateMessageRequest is the JSON body accepted by POST /messages.
//
// Named rather than anonymous so the API reference can document it: gindocs
// builds a request schema by reflecting over a real type. routes.go passes
// this type to docs.Route(...).RequestBody().
type CreateMessageRequest struct {
	ConversationID string         `json:"conversation_id" binding:"required"`
	SenderID       string         `json:"sender_id" binding:"required"`
	Body           string         `json:"body"`
	Kind           string         `json:"kind" binding:"required"`
	Attachment     *files.FileRef `json:"attachment"`
}

// UpdateMessageRequest is the JSON body accepted by PUT /messages/:id.
// Every field is optional: only what the client sends is applied.
type UpdateMessageRequest struct {
	ConversationID *string         `json:"conversation_id"`
	SenderID       *string         `json:"sender_id"`
	Body           string          `json:"body"`
	Kind           string          `json:"kind"`
	Attachment     **files.FileRef `json:"attachment"`
}

// Create adds a new message.
func (h *MessageHandler) Create(c *gin.Context) {
	var req CreateMessageRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	item := models.Message{
		ConversationID: req.ConversationID,
		SenderID:       req.SenderID,
		Body:           req.Body,
		Kind:           req.Kind,
		Attachment:     req.Attachment,
	}

	if err := h.service().Create(h.ctx(c), &item); err != nil {
		h.fail(c, err, "Failed to create message")
		return
	}

	events.Emitted(c, "messages", "Message", "created", item.ID, item.ID, "", nil, item)

	c.JSON(http.StatusCreated, gin.H{
		"data":    item,
		"message": "Message created successfully",
	})
}

// Update modifies an existing message. A client that sends the version it
// read as If-Match gets 409 instead of overwriting a newer save.
func (h *MessageHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var req UpdateMessageRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.ConversationID != nil {
		updates["conversation_id"] = *req.ConversationID
	}
	if req.SenderID != nil {
		updates["sender_id"] = *req.SenderID
	}
	if req.Body != "" {
		updates["body"] = req.Body
	}
	if req.Kind != "" {
		updates["kind"] = req.Kind
	}
	if req.Attachment != nil {
		updates["attachment"] = *req.Attachment
	}

	item, err := h.service().Update(h.ctx(c), id, updates, concurrency.FromRequest(c))
	if err != nil {
		h.fail(c, err, "Failed to update message")
		return
	}

	events.Emitted(c, "messages", "Message", "updated", item.ID, item.ID, services.DiffSummary(updates), nil, item)

	c.Header("ETag", concurrency.Tag(item.Version))
	c.JSON(http.StatusOK, gin.H{
		"data":    item,
		"message": "Message updated successfully",
	})
}

// Patch applies a partial update to a message. Used by the admin's grouped
// update view: each form group's Save button sends only the fields it owns, so
// editing "Address" does not rewrite "Pricing".
func (h *MessageHandler) Patch(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	item, updates, err := h.service().Patch(h.ctx(c), c.Param("id"), body, concurrency.FromRequest(c))
	if err != nil {
		h.fail(c, err, "Failed to patch message")
		return
	}

	events.Emitted(c, "messages", "Message", "updated", item.ID, item.ID, services.DiffSummary(updates), nil, item)

	c.Header("ETag", concurrency.Tag(item.Version))
	c.JSON(http.StatusOK, gin.H{
		"data":    item,
		"message": "Message updated successfully",
	})
}

// Delete soft-deletes a message.
func (h *MessageHandler) Delete(c *gin.Context) {
	item, err := h.service().Delete(h.ctx(c), c.Param("id"))
	if err != nil {
		h.fail(c, err, "Failed to delete message")
		return
	}

	events.Emitted(c, "messages", "Message", "deleted", item.ID, item.ID, "", item, nil)

	c.JSON(http.StatusOK, gin.H{
		"message": "Message deleted successfully",
	})
}

// BulkMessageRequest is one operation applied to a set of rows.
//
// One request rather than one per row. The admin used to fire N parallel
// DELETEs, which means N transactions, N audit entries, and a half-applied
// result when the eleventh fails.
type BulkMessageRequest struct {
	// delete removes, archive puts away, restore brings back, patch writes the
	// same field values to every selected row.
	Action string `json:"action" binding:"required,oneof=delete archive restore patch"`
	// Capped: an unbounded IN clause is a way to lock a table by accident.
	IDs []string `json:"ids" binding:"required,min=1,max=500"`
	// Only read when action is "patch". Whitelisted the same way Patch is.
	Patch map[string]interface{} `json:"patch"`
}

// Bulk applies one action to many messages in a single transaction.
func (h *MessageHandler) Bulk(c *gin.Context) {
	var req BulkMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	result, err := h.service().Bulk(h.ctx(c), req.Action, req.IDs, req.Patch)
	if err != nil {
		h.fail(c, err, "Failed to "+req.Action+" messages")
		return
	}
	if len(result.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"data":    gin.H{"affected": 0, "requested": len(req.IDs)},
			"message": "Nothing to do",
		})
		return
	}
	ids := result.IDs

	// One audit entry naming the action and the count, not N entries that bury
	// everything else somebody did today. A local map, not a package-level
	// helper: every resource has its own handler file in package handlers.
	past := map[string]string{
		"delete":  "deleted",
		"archive": "archived",
		"restore": "restored",
		"patch":   "updated",
	}[req.Action]

	noun := "messages"
	if len(ids) == 1 {
		noun = "message"
	}

	summary := req.Action + " " + strconv.Itoa(len(ids)) + " " + noun
	if req.Action == "patch" {
		summary += ": " + services.DiffSummary(result.Updates)
	}
	// resourceID holds ONE id, not all of them: it is a lookup key, and the
	// count lives in the summary, where it can be read.
	events.Emitted(c, "messages", "Message", "bulk", ids[0], summary, summary, nil, nil)

	c.JSON(http.StatusOK, gin.H{
		"data":    gin.H{"affected": len(ids), "requested": len(req.IDs)},
		"message": strconv.Itoa(len(ids)) + " " + noun + " " + past,
	})
}
