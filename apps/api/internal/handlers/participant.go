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
	"whatsapp/apps/api/internal/jsontime"
	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/paginate"
	"whatsapp/apps/api/internal/pdf"
	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/services"
)

// ParticipantHandler serves the participant endpoints. It reads the request, asks
// services.ParticipantService, and writes the answer; it runs no query of its
// own, so everything a route does is also available to a job or a test.
type ParticipantHandler struct {
	DB *gorm.DB
	// AppName brands the PDF export. The route file sets it from config.
	AppName string
}

// service is the participant service over this handler's database.
func (h *ParticipantHandler) service() *services.ParticipantService {
	return &services.ParticipantService{DB: h.DB}
}

// ctx is the request's context with the caller on it, which the service
// scopes owned rows by. The organization the multitenant plugin resolved and
// the cancellation when the client goes away travel with it.
func (h *ParticipantHandler) ctx(c *gin.Context) context.Context {
	return authz.WithActor(c.Request.Context(), authz.ActorOf(c))
}

// fail answers an error from the service: a version conflict with the version
// the record is at, a missing row with 404, a broken rule with 422 and its
// message, and anything else as an opaque 500 that is logged.
func (h *ParticipantHandler) fail(c *gin.Context, err error, fallback string) {
	var conflict *concurrency.ErrConflict
	var denied *authz.DeniedError
	switch {
	case errors.As(err, &conflict):
		concurrency.WriteConflict(c, conflict.Current)
	case errors.As(err, &denied):
		// A policy refused, and said why. 403 rather than the 404 that
		// ownership uses: the caller is already allowed to see this row,
		// so hiding it says nothing and withholds the reason, which is the
		// thing the rule exists to give.
		respond.Fail(c, respond.CodeForbidden, denied.Reason)
	case errors.Is(err, gorm.ErrRecordNotFound):
		respond.Fail(c, respond.CodeNotFound, "Participant not found")
	default:
		respond.WriteError(c, err, fallback)
	}
}

// List returns a paginated list of participants.
//
//	?archived=true   only archived rows
//	?archived=all    both
//	(default)        only live rows
func (h *ParticipantHandler) List(c *gin.Context) {
	res, err := h.service().List(h.ctx(c), paginate.Bind(c).With("conversation_id", c.Query("conversation_id")).With("user_id", c.Query("user_id")), c.Query("archived"))
	if err != nil {
		h.fail(c, err, "Failed to fetch participants")
		return
	}

	c.JSON(http.StatusOK, res)
}

// Export streams the full filtered list as CSV (default) or XLSX: the same
// search as List, without pages.
//
//	GET /api/participants/export?format=csv
//	GET /api/participants/export?format=xlsx&search=foo
func (h *ParticipantHandler) Export(c *gin.Context) {
	format := c.DefaultQuery("format", "csv")
	search := c.Query("search")

	opts := export.Options{
		Sheet: "Participants",
		Columns: []export.Column{
			{Header: "ID", Field: "ID"},
			{Header: "Role", Field: "Role"},
			{Header: "LastReadAt", Field: "LastReadAt"},
			{Header: "LastDeliveredAt", Field: "LastDeliveredAt"},
			{Header: "Muted", Field: "Muted", Format: "bool"},
			{Header: "Created At", Field: "CreatedAt", Format: "date:2006-01-02"},
		},
	}

	if format == "xlsx" {
		// Rows go into the workbook batch by batch, through a writer that moves
		// them to a temporary file, so memory stays flat however many match.
		sheet, err := export.NewXLSXStream(opts)
		if err != nil {
			h.fail(c, err, "Failed to export participants")
			return
		}
		defer func() {
			if err := sheet.Close(); err != nil {
				log.Printf("export participants as xlsx: removing temporary files: %v", err)
			}
		}()
		if err := h.service().Export(h.ctx(c), search, func(rows []models.Participant) error {
			return sheet.Rows(rows)
		}); err != nil {
			h.fail(c, err, "Failed to export participants")
			return
		}
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.Header("Content-Disposition", `attachment; filename="participants.xlsx"`)
		if err := sheet.Finish(c.Writer); err != nil {
			log.Printf("export participants as xlsx: %v", err)
		}
		return
	}

	// CSV streams: the header with the first batch, then each batch as it is
	// read.
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", `attachment; filename="participants.csv"`)

	headerWritten := false
	err := h.service().Export(h.ctx(c), search, func(rows []models.Participant) error {
		if !headerWritten {
			headerWritten = true
			return export.CSV(c.Writer, rows, opts)
		}
		return export.CSVRows(c.Writer, rows, opts)
	})
	if err == nil && !headerWritten {
		// Nothing matched: still a CSV, with its header row.
		err = export.CSV(c.Writer, []models.Participant{}, opts)
	}
	if err != nil {
		if !c.Writer.Written() {
			c.Writer.Header().Del("Content-Type")
			c.Writer.Header().Del("Content-Disposition")
			h.fail(c, err, "Failed to export participants")
			return
		}
		// Rows are already on the wire, so the status cannot change. Logged,
		// so a truncated file has an explanation somewhere.
		log.Printf("export participants: %v", err)
	}
}

// GetByID returns a single participant by ID.
func (h *ParticipantHandler) GetByID(c *gin.Context) {
	item, err := h.service().GetByID(h.ctx(c), c.Param("id"))
	if err != nil {
		h.fail(c, err, "Failed to load participant")
		return
	}

	// The version to send back as If-Match when saving.
	c.Header("ETag", concurrency.Tag(item.Version))
	c.JSON(http.StatusOK, gin.H{
		"data": item,
	})
}

// PDF streams this participant as a print-ready PDF: a repeating header and
// footer with page numbers, the record's fields as a detail grid, and any
// line items as a table. Edit the pdf.Record below to restyle it; the
// renderer itself lives in internal/pdf/record.go.
func (h *ParticipantHandler) PDF(c *gin.Context) {
	id := c.Param("id")

	item, err := h.service().GetByID(h.ctx(c), id)
	if err != nil {
		h.fail(c, err, "Failed to load participant")
		return
	}

	appName := h.AppName
	if appName == "" {
		appName = "Participant"
	}

	rec := pdf.Record{
		Title:      "PARTICIPANT",
		Subtitle:   pdf.Value(item.ID),
		Brand:      appName,
		FooterNote: appName + " · generated " + time.Now().Format("2 Jan 2006 15:04"),
		Fields: []pdf.Field{
			{Label: "Conversation", Value: pdf.Display(item.Conversation)},
			{Label: "User", Value: pdf.Display(item.User)},
			{Label: "Role", Value: pdf.Value(item.Role)},
			{Label: "Last Read At", Value: pdf.Value(item.LastReadAt)},
			{Label: "Last Delivered At", Value: pdf.Value(item.LastDeliveredAt)},
			{Label: "Muted", Value: pdf.Value(item.Muted)},
			{Label: "Created", Value: pdf.Value(item.CreatedAt)},
		},
	}

	out, err := pdf.RenderRecord(rec)
	if err != nil {
		respond.Fail(c, respond.CodePDFError, "could not render the PDF")
		return
	}

	filename := "participant-" + id + ".pdf"
	c.Header("Content-Disposition", "inline; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/pdf", out)
}

// CreateParticipantRequest is the JSON body accepted by POST /participants.
//
// Named rather than anonymous so the API reference can document it: gindocs
// builds a request schema by reflecting over a real type. routes.go passes
// this type to docs.Route(...).RequestBody().
type CreateParticipantRequest struct {
	ConversationID  string             `json:"conversation_id" binding:"required"`
	UserID          string             `json:"user_id" binding:"required"`
	Role            string             `json:"role" binding:"required"`
	LastReadAt      *jsontime.DateTime `json:"last_read_at"`
	LastDeliveredAt *jsontime.DateTime `json:"last_delivered_at"`
	Muted           bool               `json:"muted"`
}

// UpdateParticipantRequest is the JSON body accepted by PUT /participants/:id.
// Every field is optional: only what the client sends is applied.
type UpdateParticipantRequest struct {
	ConversationID  *string             `json:"conversation_id"`
	UserID          *string             `json:"user_id"`
	Role            string              `json:"role"`
	LastReadAt      **jsontime.DateTime `json:"last_read_at"`
	LastDeliveredAt **jsontime.DateTime `json:"last_delivered_at"`
	Muted           *bool               `json:"muted"`
}

// Create adds a new participant.
func (h *ParticipantHandler) Create(c *gin.Context) {
	var req CreateParticipantRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	item := models.Participant{
		ConversationID:  req.ConversationID,
		UserID:          req.UserID,
		Role:            req.Role,
		LastReadAt:      req.LastReadAt,
		LastDeliveredAt: req.LastDeliveredAt,
		Muted:           req.Muted,
	}

	if err := h.service().Create(h.ctx(c), &item); err != nil {
		h.fail(c, err, "Failed to create participant")
		return
	}

	events.Emitted(c, "participants", "Participant", "created", item.ID, item.ID, "", nil, item)

	c.JSON(http.StatusCreated, gin.H{
		"data":    item,
		"message": "Participant created successfully",
	})
}

// Update modifies an existing participant. A client that sends the version it
// read as If-Match gets 409 instead of overwriting a newer save.
func (h *ParticipantHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var req UpdateParticipantRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.ConversationID != nil {
		updates["conversation_id"] = *req.ConversationID
	}
	if req.UserID != nil {
		updates["user_id"] = *req.UserID
	}
	if req.Role != "" {
		updates["role"] = req.Role
	}
	if req.LastReadAt != nil {
		updates["last_read_at"] = *req.LastReadAt
	}
	if req.LastDeliveredAt != nil {
		updates["last_delivered_at"] = *req.LastDeliveredAt
	}
	if req.Muted != nil {
		updates["muted"] = *req.Muted
	}

	item, err := h.service().Update(h.ctx(c), id, updates, concurrency.FromRequest(c))
	if err != nil {
		h.fail(c, err, "Failed to update participant")
		return
	}

	events.Emitted(c, "participants", "Participant", "updated", item.ID, item.ID, services.DiffSummary(updates), nil, item)

	c.Header("ETag", concurrency.Tag(item.Version))
	c.JSON(http.StatusOK, gin.H{
		"data":    item,
		"message": "Participant updated successfully",
	})
}

// Patch applies a partial update to a participant. Used by the admin's grouped
// update view: each form group's Save button sends only the fields it owns, so
// editing "Address" does not rewrite "Pricing".
func (h *ParticipantHandler) Patch(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	item, updates, err := h.service().Patch(h.ctx(c), c.Param("id"), body, concurrency.FromRequest(c))
	if err != nil {
		h.fail(c, err, "Failed to patch participant")
		return
	}

	events.Emitted(c, "participants", "Participant", "updated", item.ID, item.ID, services.DiffSummary(updates), nil, item)

	c.Header("ETag", concurrency.Tag(item.Version))
	c.JSON(http.StatusOK, gin.H{
		"data":    item,
		"message": "Participant updated successfully",
	})
}

// Delete soft-deletes a participant.
func (h *ParticipantHandler) Delete(c *gin.Context) {
	item, err := h.service().Delete(h.ctx(c), c.Param("id"))
	if err != nil {
		h.fail(c, err, "Failed to delete participant")
		return
	}

	events.Emitted(c, "participants", "Participant", "deleted", item.ID, item.ID, "", item, nil)

	c.JSON(http.StatusOK, gin.H{
		"message": "Participant deleted successfully",
	})
}

// BulkParticipantRequest is one operation applied to a set of rows.
//
// One request rather than one per row. The admin used to fire N parallel
// DELETEs, which means N transactions, N audit entries, and a half-applied
// result when the eleventh fails.
type BulkParticipantRequest struct {
	// delete removes, archive puts away, restore brings back, patch writes the
	// same field values to every selected row.
	Action string `json:"action" binding:"required,oneof=delete archive restore patch"`
	// Capped: an unbounded IN clause is a way to lock a table by accident.
	IDs []string `json:"ids" binding:"required,min=1,max=500"`
	// Only read when action is "patch". Whitelisted the same way Patch is.
	Patch map[string]interface{} `json:"patch"`
}

// Bulk applies one action to many participants in a single transaction.
func (h *ParticipantHandler) Bulk(c *gin.Context) {
	var req BulkParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	result, err := h.service().Bulk(h.ctx(c), req.Action, req.IDs, req.Patch)
	if err != nil {
		h.fail(c, err, "Failed to "+req.Action+" participants")
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

	noun := "participants"
	if len(ids) == 1 {
		noun = "participant"
	}

	summary := req.Action + " " + strconv.Itoa(len(ids)) + " " + noun
	if req.Action == "patch" {
		summary += ": " + services.DiffSummary(result.Updates)
	}
	// resourceID holds ONE id, not all of them: it is a lookup key, and the
	// count lives in the summary, where it can be read.
	events.Emitted(c, "participants", "Participant", "bulk", ids[0], summary, summary, nil, nil)

	c.JSON(http.StatusOK, gin.H{
		"data":    gin.H{"affected": len(ids), "requested": len(req.IDs)},
		"message": strconv.Itoa(len(ids)) + " " + noun + " " + past,
	})
}

// The two grid endpoints, for the admin's spreadsheet editors.
//
// Separate from Bulk rather than actions on it, because the request shapes are
// genuinely different: Bulk takes ids and ONE patch for all of them, and these
// take a row each. Folding them in would mean a required ids field that two of
// the five actions ignore.

// BulkEditParticipantRequest is the grid's save: one patch per row.
type BulkEditParticipantRequest struct {
	// Capped for the same reason Bulk's ids are: a transaction holding five
	// hundred row locks is a transaction other writers wait behind.
	Items []services.ParticipantGridEdit `json:"items" binding:"required,min=1,max=500"`
}

// BulkEdit saves a grid of edits, one patch per row, in one transaction.
func (h *ParticipantHandler) BulkEdit(c *gin.Context) {
	var req BulkEditParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	saved, rowErrors, err := h.service().BulkEdit(h.ctx(c), req.Items)
	if err != nil {
		h.fail(c, err, "Failed to save the participants")
		return
	}
	// Row errors are a 422 with the rows in it, so the grid can put each
	// message back on the line it belongs to rather than showing one banner.
	if len(rowErrors) > 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{
			"code":    "VALIDATION_ERROR",
			"message": "Some rows could not be saved",
			"details": gin.H{"rows": rowErrors},
		}})
		return
	}
	if len(saved) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"data":    gin.H{"affected": 0, "requested": len(req.Items)},
			"message": "Nothing to do",
		})
		return
	}

	noun := "participants"
	if len(saved) == 1 {
		noun = "participant"
	}
	summary := "edited " + strconv.Itoa(len(saved)) + " " + noun + " in the grid"
	events.Emitted(c, "participants", "Participant", "bulk", saved[0], summary, summary, nil, nil)

	c.JSON(http.StatusOK, gin.H{
		"data":    gin.H{"affected": len(saved), "requested": len(req.Items)},
		"message": strconv.Itoa(len(saved)) + " " + noun + " updated",
	})
}

// BulkCreateParticipantRequest is the grid's insert: whole rows, no ids.
type BulkCreateParticipantRequest struct {
	Items []map[string]interface{} `json:"items" binding:"required,min=1,max=500"`
}

// BulkCreate inserts a grid of new participants in one transaction.
func (h *ParticipantHandler) BulkCreate(c *gin.Context) {
	var req BulkCreateParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	created, rowErrors, err := h.service().BulkCreate(h.ctx(c), req.Items)
	if err != nil {
		h.fail(c, err, "Failed to create the participants")
		return
	}
	if len(rowErrors) > 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{
			"code":    "VALIDATION_ERROR",
			"message": "Some rows could not be created",
			"details": gin.H{"rows": rowErrors},
		}})
		return
	}
	if len(created) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"data":    gin.H{"affected": 0, "requested": len(req.Items)},
			"message": "Nothing to do",
		})
		return
	}

	noun := "participants"
	if len(created) == 1 {
		noun = "participant"
	}
	summary := "created " + strconv.Itoa(len(created)) + " " + noun + " in the grid"
	events.Emitted(c, "participants", "Participant", "bulk", created[0].ID, summary, summary, nil, nil)

	// The rows as stored, so the grid can show the ids, the generated slugs and
	// anything else a hook filled in rather than guessing at them.
	c.JSON(http.StatusCreated, gin.H{
		"data":    created,
		"message": strconv.Itoa(len(created)) + " " + noun + " created",
	})
}
