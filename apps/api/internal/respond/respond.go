// Package respond is the standard error/response envelope for handlers.
// Use these instead of writing c.JSON(500, gin.H{"error": err.Error()})
// inline so error shapes stay consistent and the frontend's
// apiErrorMessage() helper has a single shape to walk.
package respond

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Error is the wire shape of every error envelope.
type Error struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// The named helpers, each one line over Fail.
//
// They used to carry a status and a code side by side, hardcoded here, while
// codes.go carried the same pairs generated from the catalogue. Two tables for
// one fact is how VALIDATION_ERROR came back as 422 from one helper and 400
// from a handler that wrote its own envelope. There is one table now, in
// codes.go, and everything below reads the status out of it.

// BadRequest is 400: a malformed request the client cannot fix without
// changing what it sent.
func BadRequest(c *gin.Context, message string) {
	Fail(c, CodeBadRequest, message)
}

// Unauthorized is 401: missing or invalid credentials.
func Unauthorized(c *gin.Context, message string) {
	if message == "" {
		message = "Authentication required"
	}
	Fail(c, CodeUnauthorized, message)
}

// Forbidden is 403: authenticated, but not allowed.
func Forbidden(c *gin.Context, message string) {
	if message == "" {
		message = "You don't have permission to do that"
	}
	Fail(c, CodeForbidden, message)
}

// NotFound is 404: the entity did not exist, or access rules filtered it out.
func NotFound(c *gin.Context, message string) {
	if message == "" {
		message = "Not found"
	}
	Fail(c, CodeNotFound, message)
}

// Conflict is 409: a unique constraint, or a version conflict.
func Conflict(c *gin.Context, message string) {
	Fail(c, CodeConflict, message)
}

// Validation is 422: the payload was well formed and failed validation. Pass
// per-field messages so the frontend can highlight the fields.
func Validation(c *gin.Context, message string, fields map[string]string) {
	Fail(c, CodeValidationError, message, fields)
}

// RuleError is a business rule the caller broke, phrased for the caller.
//
// Errors coming back from a write are mostly not for the client: a driver
// failure or a constraint violation carries schema details and sometimes SQL,
// so the handler cannot simply echo what it gets. This is how application code
// says "this one is different, the message is the point".
//
// Return it from a GORM hook, a callback or a service method:
//
//	func (e *JournalEntry) BeforeCreate(tx *gorm.DB) error {
//	    if !balanced(e.Lines) {
//	        return respond.Rule("debits and credits do not balance")
//	    }
//	    return nil
//	}
//
// and the caller gets 422 with that sentence instead of an opaque 500.
type RuleError struct{ Message string }

func (e *RuleError) Error() string { return e.Message }

// Rule builds a RuleError. Takes a format string because most rules want to
// quote the values that broke them.
func Rule(format string, args ...interface{}) error {
	return &RuleError{Message: fmt.Sprintf(format, args...)}
}

// IsRule reports whether err is, or wraps, a RuleError.
func IsRule(err error) (*RuleError, bool) {
	var rule *RuleError
	if errors.As(err, &rule) {
		return rule, true
	}
	return nil, false
}

// Coded is an error that knows what it should look like on the wire.
//
// Implement it on a sentinel error when the caller needs to act on it, rather
// than leaving it to become an opaque 500:
//
//	var ErrNoSeatsLeft = seatsError{}
//
//	type seatsError struct{}
//	func (seatsError) Error() string          { return "no seats left on this plan" }
//	func (seatsError) ErrorCode() respond.Code { return respond.CodeConflict }
//
// Anything returned from a service or a GORM hook that implements this is
// answered with the code's documented status. This exists because
// tenant.ErrNoOrganization, which means "say which organization you are acting
// in", arrived as a 500 saying "Failed to fetch deals": respond cannot import
// the tenant package, and an error that can describe itself does not need it to.
type Coded interface {
	error
	ErrorCode() Code
}

// FieldErrors is an error about particular fields, such as a value refused by
// its column's format in internal/fieldtypes. It is answered with 422 and the
// per-field messages in details, so a form can put each one under its input.
type FieldErrors interface {
	error
	FieldErrors() map[string]string
}

// WriteError picks the right response for an error returned by a write.
//
// An error that carries its own code is answered with that code's status. A rule
// the caller broke becomes 422 with its message. A missing row becomes 404.
// Everything else is logged and comes back as an opaque 500, which is what it was
// before, minus the part where the error vanished entirely.
func WriteError(c *gin.Context, err error, fallback string) {
	var fields FieldErrors
	if errors.As(err, &fields) {
		Validation(c, fields.Error(), fields.FieldErrors())
		return
	}
	var coded Coded
	if errors.As(err, &coded) {
		Fail(c, coded.ErrorCode(), coded.Error())
		return
	}
	if rule, ok := IsRule(err); ok {
		Validation(c, rule.Message, nil)
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		NotFound(c, "")
		return
	}
	ServerError(c, "INTERNAL_ERROR", err, fallback)
}

// Internal answers 500 with a generic message. The error is logged with the
// request it failed rather than sent: its text is for the operator, and to a
// client it can describe the schema. It used to be discarded, so a 500 from
// here left no trace anywhere.
func Internal(c *gin.Context, internalErr error) {
	ServerError(c, "INTERNAL_ERROR", internalErr, "Internal server error")
}

// ServerError answers 500 with code and a message safe for the client, and
// logs err with the method, path and request id, so the cause reaches the
// operator and not the caller. The request id is the X-Request-ID header the
// client received, which is how a report of a failure finds its log line.
func ServerError(c *gin.Context, code string, err error, message string) {
	if err != nil {
		_ = c.Error(err)
	}
	log.Printf("[500] %s %s | id=%s | %s: %v", c.Request.Method, c.Request.URL.Path, c.GetString("request_id"), code, err)
	// Not Fail: code is a plain string here, so callers can name the subsystem
	// that broke (DB_ERROR, STORAGE_ERROR) without every one of them being a
	// catalogued constant. The status is 500 either way.
	c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": Error{Code: code, Message: message}})
}

// OK writes 200 with { data, message? }.
func OK(c *gin.Context, data interface{}, message ...string) {
	body := gin.H{"data": data}
	if len(message) > 0 && message[0] != "" {
		body["message"] = message[0]
	}
	c.JSON(http.StatusOK, body)
}

// Created writes 201 with { data, message? }.
func Created(c *gin.Context, data interface{}, message ...string) {
	body := gin.H{"data": data}
	if len(message) > 0 && message[0] != "" {
		body["message"] = message[0]
	}
	c.JSON(http.StatusCreated, body)
}
